"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Landmark, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { formatDate } from "@/lib/utils";

type Statement = {
  id: string;
  title: string;
  accountName: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  notes: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  uploadedBy: { id: string; name: string };
};

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export function BankStatementsClient({
  initialItems,
  canUpload,
}: {
  initialItems: Statement[];
  canUpload: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [accountName, setAccountName] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);

  async function upload() {
    if (!title.trim() || !file) {
      toast.error("Add a title and choose a statement file");
      return;
    }
    setBusy(true);
    try {
      const storageUrl = await fileToDataUrl(file);
      const res = await fetch("/api/expenses/statements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          accountName,
          periodStart,
          periodEnd,
          notes,
          fileName: file.name,
          mimeType: file.type || "application/pdf",
          storageUrl,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "Could not save statement");
        return;
      }
      setItems((current) => [body, ...current]);
      setOpen(false);
      setTitle("");
      setAccountName("");
      setPeriodStart("");
      setPeriodEnd("");
      setNotes("");
      setFile(null);
      toast.success("Bank statement saved");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/expenses/statements/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error || "Could not remove statement");
      return;
    }
    setItems((current) => current.filter((item) => item.id !== id));
    toast.success("Statement removed");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Finance</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Bank statements</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            Keep monthly bank PDFs and CSVs with expenses so they are easy to find at close.
          </p>
        </div>
        {canUpload ? (
          <Button type="button" className="rounded-xl" onClick={() => setOpen((value) => !value)}>
            <Plus className="h-4 w-4" />
            {open ? "Close" : "Upload statement"}
          </Button>
        ) : null}
      </div>

      {open && canUpload ? (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Upload bank statement</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium sm:col-span-2">
              Title
              <Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="August checking statement" />
            </label>
            <label className="text-sm font-medium">
              Account
              <Input className="mt-1" value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="Operating checking" />
            </label>
            <label className="text-sm font-medium">
              File
              <Input
                className="mt-1"
                type="file"
                accept="application/pdf,text/csv,image/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <label className="text-sm font-medium">
              Period start
              <Input className="mt-1" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </label>
            <label className="text-sm font-medium">
              Period end
              <Input className="mt-1" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </label>
            <label className="text-sm font-medium sm:col-span-2">
              Notes
              <Input className="mt-1" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            <div className="sm:col-span-2">
              <Button type="button" onClick={upload} disabled={busy}>
                <Upload className="h-4 w-4" />
                {busy ? "Saving…" : "Save statement"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!items.length ? (
        <EmptyState
          icon={Landmark}
          title="No bank statements yet"
          description="Upload monthly PDFs or CSVs here so they sit with expenses instead of a shared drive."
        />
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{item.title}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {item.accountName ? `${item.accountName} · ` : ""}
                  {item.periodStart || item.periodEnd
                    ? `${item.periodStart ? formatDate(item.periodStart) : "?"} – ${item.periodEnd ? formatDate(item.periodEnd) : "?"}`
                    : "No period set"}
                </p>
                <p className="text-xs text-slate-400">
                  {item.fileName} · uploaded by {item.uploadedBy.name}
                </p>
              </div>
              <div className="flex gap-2">
                <Button asChild variant="outline" size="sm">
                  <a href={`/api/expenses/statements/${item.id}`} target="_blank" rel="noreferrer">
                    Open
                  </a>
                </Button>
                {canUpload ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => remove(item.id)}>
                    <Trash2 className="h-4 w-4" />
                    Remove
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
