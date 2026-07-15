"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ExpenseStatusBadge } from "./status-badge";
import { AlertTriangle, Check, Flag, MessageSquare, RotateCcw, X } from "lucide-react";

type ExpenseDetail = {
  id: string;
  merchant: string;
  amount: unknown;
  tax: unknown;
  tip: unknown;
  total: unknown;
  notes: string | null;
  status: string;
  purchaseDate: string | Date;
  missingReceipt: boolean;
  department: string | null;
  project: string | null;
  jobNumber: string | null;
  employee: { id: string; name: string };
  category: { name: string } | null;
  companyCard: { name: string; lastFour: string } | null;
  location: { name: string } | null;
  receipts: Array<{ id: string; storageUrl: string; kind: string; fileName: string }>;
  flags: Array<{ id: string; message: string; type: string; severity: string }>;
  comments: Array<{ id: string; body: string; createdAt: string | Date; author: { name: string } }>;
  approvalEvents: Array<{
    id: string;
    action: string;
    note: string | null;
    createdAt: string | Date;
    fromStatus: string | null;
    toStatus: string;
    actor: { name: string };
  }>;
};

export function ApprovalPanel({
  expense,
  canApprove,
  canReimburse,
}: {
  expense: ExpenseDetail;
  canApprove: boolean;
  canReimburse: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [comment, setComment] = useState("");
  const [pending, startTransition] = useTransition();

  function act(action: string, extra?: Record<string, string>) {
    startTransition(async () => {
      const res = await fetch(`/api/expenses/${expense.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: note || undefined, ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Action failed");
        return;
      }
      toast.success(`${action.replaceAll("_", " ")} completed`);
      setNote("");
      router.refresh();
    });
  }

  function postComment() {
    if (!comment.trim()) return;
    startTransition(async () => {
      const res = await fetch(`/api/expenses/${expense.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: comment }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Comment failed");
        return;
      }
      setComment("");
      toast.success("Comment added");
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">{expense.merchant}</h1>
              <p className="mt-1 text-sm text-slate-500">
                {expense.employee.name}
                {expense.category ? ` · ${expense.category.name}` : ""}
                {" · "}
                {formatDate(expense.purchaseDate)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-semibold">{formatCurrency(Number(expense.total))}</p>
              <div className="mt-1 flex justify-end gap-2">
                <ExpenseStatusBadge status={expense.status} />
                {expense.missingReceipt ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                    <AlertTriangle className="h-3 w-3" />
                    Missing receipt
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Amount / Tax / Tip</dt>
              <dd className="font-medium">
                {formatCurrency(Number(expense.amount))} / {formatCurrency(Number(expense.tax))} /{" "}
                {formatCurrency(Number(expense.tip))}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Card used</dt>
              <dd className="font-medium">
                {expense.companyCard
                  ? `${expense.companyCard.name} ····${expense.companyCard.lastFour}`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Location</dt>
              <dd className="font-medium">{expense.location?.name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Department</dt>
              <dd className="font-medium">{expense.department ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Project / Job</dt>
              <dd className="font-medium">
                {expense.project || "—"} / {expense.jobNumber || "—"}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-slate-500">Notes</dt>
              <dd className="font-medium">{expense.notes || "—"}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Receipt
          </h2>
          {expense.receipts.length === 0 ? (
            <p className="text-sm text-amber-700">No receipt attached yet.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {expense.receipts.map((r) =>
                r.kind === "PDF" ? (
                  <a
                    key={r.id}
                    href={r.storageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl border border-slate-200 px-4 py-6 text-center text-sm font-medium hover:bg-slate-50"
                  >
                    {r.fileName}
                  </a>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={r.id}
                    src={r.storageUrl}
                    alt={r.fileName}
                    className="max-h-80 w-full rounded-xl object-contain bg-slate-50"
                  />
                )
              )}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {expense.flags.length > 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-900">
              <Flag className="h-4 w-4" />
              Policy warnings
            </h2>
            <ul className="space-y-1 text-sm text-amber-900">
              {expense.flags.map((f) => (
                <li key={f.id}>
                  <span className="font-medium">{f.type.replaceAll("_", " ")}:</span> {f.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {(canApprove || canReimburse) && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Review
            </h2>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note for approve / reject / request changes…"
              className="rounded-xl"
              rows={3}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {canApprove ? (
                <>
                  <Button
                    className="min-h-11 rounded-xl"
                    disabled={pending}
                    onClick={() => act("APPROVE")}
                  >
                    <Check className="h-4 w-4" />
                    Approve
                  </Button>
                  <Button
                    variant="destructive"
                    className="min-h-11 rounded-xl"
                    disabled={pending}
                    onClick={() => act("REJECT")}
                  >
                    <X className="h-4 w-4" />
                    Reject
                  </Button>
                  <Button
                    variant="outline"
                    className="min-h-11 rounded-xl"
                    disabled={pending}
                    onClick={() => act("REQUEST_CHANGES")}
                  >
                    <RotateCcw className="h-4 w-4" />
                    Request changes
                  </Button>
                  <Button
                    variant="outline"
                    className="min-h-11 rounded-xl"
                    disabled={pending}
                    onClick={() => act("FLAG", { flagMessage: note || "Flagged for review" })}
                  >
                    <Flag className="h-4 w-4" />
                    Flag
                  </Button>
                </>
              ) : null}
              {canReimburse ? (
                <>
                  <Button
                    variant="outline"
                    className="min-h-11 rounded-xl"
                    disabled={pending}
                    onClick={() => act("REIMBURSE")}
                  >
                    Reimburse
                  </Button>
                  <Button
                    variant="outline"
                    className="min-h-11 rounded-xl"
                    disabled={pending}
                    onClick={() => act("MARK_PAID")}
                  >
                    Mark paid
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            <MessageSquare className="h-4 w-4" />
            Comments
          </h2>
          <ul className="mb-3 space-y-3">
            {expense.comments.length === 0 ? (
              <li className="text-sm text-slate-500">No comments yet.</li>
            ) : (
              expense.comments.map((c) => (
                <li key={c.id} className="rounded-xl bg-slate-50 px-3 py-2 text-sm">
                  <p className="font-medium text-slate-900">{c.author.name}</p>
                  <p className="text-slate-700">{c.body}</p>
                  <p className="mt-1 text-xs text-slate-400">{formatDate(c.createdAt)}</p>
                </li>
              ))
            )}
          </ul>
          <div className="flex gap-2">
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Leave a comment…"
              className="rounded-xl"
              rows={2}
            />
            <Button className="self-end rounded-xl" disabled={pending} onClick={postComment}>
              Post
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            History
          </h2>
          <ul className="space-y-3">
            {expense.approvalEvents.length === 0 ? (
              <li className="text-sm text-slate-500">No approval history yet.</li>
            ) : (
              expense.approvalEvents.map((event) => (
                <li key={event.id} className="border-l-2 border-slate-200 pl-3 text-sm">
                  <p className="font-medium text-slate-900">
                    {event.actor.name} · {event.action}
                  </p>
                  <p className="text-slate-500">
                    {event.fromStatus ?? "—"} → {event.toStatus}
                  </p>
                  {event.note ? <p className="text-slate-700">{event.note}</p> : null}
                  <p className="text-xs text-slate-400">{formatDate(event.createdAt)}</p>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
