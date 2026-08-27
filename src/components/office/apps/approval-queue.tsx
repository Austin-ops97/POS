"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, MessageSquareWarning, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFormatDate } from "@/components/providers/timezone-provider";

type QueueItem = {
  id: string;
  status: string;
  completionNote: string | null;
  submittedAt: string;
  photoCount: number;
  project: { id: string; title: string; status: string; summary: string | null };
  submittedBy: { id: string; name: string };
  attachments: Array<{ id: string; storageUrl: string; originalFilename: string }>;
};

async function apiError(response: Response) {
  const body = await response.json().catch(() => null);
  return body?.error ?? "Request failed";
}

export function ApprovalQueue() {
  const formatDate = useFormatDate();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/office/approvals");
      if (!res.ok) throw new Error(await apiError(res));
      setItems(await res.json());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load approvals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function review(id: string, action: "APPROVE" | "CHANGES_REQUESTED" | "REJECT") {
    setBusyId(id);
    try {
      const res = await fetch(`/api/office/approvals/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, comment: comments[id] || null }),
      });
      if (!res.ok) throw new Error(await apiError(res));
      toast.success(action === "APPROVE" ? "Approved" : action === "REJECT" ? "Rejected" : "Changes requested");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Review failed");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading approval queue…
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
        <p className="text-lg font-semibold text-slate-900">No pending project approvals</p>
        <p className="mt-1 text-sm text-slate-500">Submissions waiting for review will show up here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">{item.project.title}</h2>
              <p className="mt-1 text-sm text-slate-500">
                Submitted by {item.submittedBy.name} · {formatDate(item.submittedAt)}
              </p>
              {item.completionNote ? <p className="mt-2 text-sm text-slate-700">{item.completionNote}</p> : null}
            </div>
            <span className="rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
              {item.photoCount} photo{item.photoCount === 1 ? "" : "s"}
            </span>
          </div>

          {item.attachments.length ? (
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {item.attachments.map((photo) => (
                <a key={photo.id} href={photo.storageUrl} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl border border-slate-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.storageUrl} alt={photo.originalFilename} className="aspect-square w-full object-cover" />
                </a>
              ))}
            </div>
          ) : null}

          <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
            <Input
              value={comments[item.id] ?? ""}
              onChange={(e) => setComments((prev) => ({ ...prev, [item.id]: e.target.value }))}
              placeholder="Review comment (required for changes / reject)"
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={busyId === item.id} onClick={() => void review(item.id, "APPROVE")}>
                <Check className="h-4 w-4" />
                Approve
              </Button>
              <Button type="button" variant="outline" disabled={busyId === item.id} onClick={() => void review(item.id, "CHANGES_REQUESTED")}>
                <MessageSquareWarning className="h-4 w-4" />
                Request changes
              </Button>
              <Button type="button" variant="outline" disabled={busyId === item.id} onClick={() => void review(item.id, "REJECT")}>
                <X className="h-4 w-4 text-red-500" />
                Reject
              </Button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
