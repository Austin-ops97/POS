"use client";

import { FormEvent, useState } from "react";
import { Megaphone, Mail, Plus, Save, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { OfficeSuiteModule } from "@/lib/office/suite";
import type { OfficeWorkspaceRecordSummary } from "@/lib/office/workspace-service";
import { OfficeAppHeader } from "./app-header";
import { createWorkspaceRecord, recordMetadata, updateWorkspaceRecord, type OfficeAppPermissions } from "./record-client";

type MessageData = { kind: "email" | "announcement"; to: string; subject: string; body: string; sentAt?: string };
const blank: MessageData = { kind: "email", to: "", subject: "", body: "" };

export function CommunicationApp({ module, initialRecords, permissions }: { module: OfficeSuiteModule; initialRecords: OfficeWorkspaceRecordSummary[]; permissions: OfficeAppPermissions }) {
  const [records, setRecords] = useState(initialRecords);
  const [activeId, setActiveId] = useState(initialRecords[0]?.id ?? "");
  const [message, setMessage] = useState<MessageData>(recordMetadata(initialRecords[0], blank));
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  function load(record?: OfficeWorkspaceRecordSummary) { setActiveId(record?.id ?? ""); setMessage(recordMetadata(record, blank)); }
  async function save() {
    if (!message.subject.trim()) { toast.error("Add a subject first"); return undefined; }
    setBusy(true);
    try {
      const active = records.find((record) => record.id === activeId);
      const saved = active ? await updateWorkspaceRecord(module.slug, active.id, { title: message.subject, summary: message.body.slice(0, 180), metadata: message }) : await createWorkspaceRecord(module.slug, { title: message.subject, summary: message.body.slice(0, 180), status: "DRAFT", metadata: message });
      setRecords((items) => active ? items.map((item) => item.id === saved.id ? saved : item) : [saved, ...items]); setActiveId(saved.id); toast.success(message.kind === "announcement" ? "Announcement saved" : "Draft saved");
      return saved;
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save draft"); } finally { setBusy(false); }
  }
  async function send(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      const saved = await save();
      if (!saved) return;
      const response = await fetch("/api/office/messages/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: message.to, subject: message.subject, body: message.body, confirmed: true, recordId: saved.id }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Could not send email");
      const sentAt = new Date().toISOString();
      const updated = await updateWorkspaceRecord(module.slug, saved.id, { status: "COMPLETE", metadata: { ...message, sentAt } });
      setMessage((current) => ({ ...current, sentAt })); setRecords((items) => items.map((item) => item.id === updated.id ? updated : item)); setConfirming(false); toast.success("Email sent");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not send email"); } finally { setBusy(false); }
  }
  return <div className="space-y-5 pb-8">
    <OfficeAppHeader module={module}><Button variant="outline" onClick={() => load()} disabled={!permissions.canCreate}><Plus className="h-4 w-4" />New message</Button><Button onClick={save} disabled={busy || (!activeId && !permissions.canCreate)}><Save className="h-4 w-4" />Save</Button></OfficeAppHeader>
    <div className="grid min-h-[620px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[300px_1fr]">
      <aside className="border-b border-slate-200 bg-slate-50 p-4 lg:border-b-0 lg:border-r">
        <div className="grid grid-cols-2 rounded-xl bg-slate-200 p-1"><button onClick={() => setMessage((m) => ({ ...m, kind: "email" }))} className={`rounded-lg px-3 py-2 text-sm font-medium ${message.kind === "email" ? "bg-white shadow-sm" : "text-slate-600"}`}><Mail className="mr-1.5 inline h-4 w-4" />Email</button><button onClick={() => setMessage((m) => ({ ...m, kind: "announcement", to: "" }))} className={`rounded-lg px-3 py-2 text-sm font-medium ${message.kind === "announcement" ? "bg-white shadow-sm" : "text-slate-600"}`}><Megaphone className="mr-1.5 inline h-4 w-4" />Internal</button></div>
        <p className="mt-6 text-xs font-semibold uppercase tracking-wider text-slate-500">Saved messages</p>
        <div className="mt-2 space-y-1">{records.map((record) => { const data = recordMetadata<MessageData>(record, blank); return <button key={record.id} onClick={() => load(record)} className={`w-full rounded-xl p-3 text-left ${record.id === activeId ? "bg-violet-100 text-violet-950" : "hover:bg-slate-100"}`}><span className="block truncate text-sm font-semibold">{record.title}</span><span className="mt-1 block truncate text-xs text-slate-500">{data.sentAt ? "Sent" : data.kind === "announcement" ? "Internal announcement" : data.to || "Draft"}</span></button>; })}{!records.length ? <p className="p-3 text-sm text-slate-500">No saved messages.</p> : null}</div>
      </aside>
      <main className="p-5 sm:p-8">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 flex items-center gap-3"><div className="rounded-xl bg-violet-100 p-3 text-violet-700">{message.kind === "email" ? <Mail /> : <Megaphone />}</div><div><h2 className="text-xl font-semibold">{message.kind === "email" ? "Compose email" : "Team announcement"}</h2><p className="text-sm text-slate-500">{message.kind === "email" ? "Nothing is sent until you review and confirm." : "Saved here for the team to reference."}</p></div></div>
          {message.kind === "email" ? <label className="block text-sm font-medium">Recipient<Input type="email" value={message.to} onChange={(e) => setMessage((m) => ({ ...m, to: e.target.value }))} className="mt-1.5" placeholder="customer@example.com" /></label> : null}
          <label className="mt-4 block text-sm font-medium">Subject<Input value={message.subject} onChange={(e) => setMessage((m) => ({ ...m, subject: e.target.value }))} className="mt-1.5" placeholder={message.kind === "email" ? "How can we help?" : "What the team needs to know"} /></label>
          <label className="mt-4 block text-sm font-medium">Message<Textarea value={message.body} onChange={(e) => setMessage((m) => ({ ...m, body: e.target.value }))} className="mt-1.5 min-h-72 leading-6" placeholder="Write a clear, useful message…" /></label>
          {message.kind === "email" ? <div className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-violet-100 bg-violet-50 p-4"><div className="flex gap-3"><ShieldCheck className="h-5 w-5 shrink-0 text-violet-700" /><p className="text-sm text-violet-900"><strong>Review safeguard:</strong> sending opens a final confirmation with the exact recipient and subject.</p></div><Button onClick={() => { if (!message.to || !message.subject || !message.body) toast.error("Complete the recipient, subject, and message"); else setConfirming(true); }} disabled={!!message.sentAt}><Send className="h-4 w-4" />{message.sentAt ? "Sent" : "Review & send"}</Button></div> : <Button className="mt-5" onClick={save}><Megaphone className="h-4 w-4" />Save announcement</Button>}
        </div>
      </main>
    </div>
    <Dialog open={confirming} onOpenChange={setConfirming}><DialogContent><form onSubmit={send}><DialogHeader><DialogTitle>Send this email?</DialogTitle><DialogDescription>This will send immediately. Confirm the recipient and subject before continuing.</DialogDescription></DialogHeader><div className="my-5 rounded-xl bg-slate-50 p-4 text-sm"><p><strong>To:</strong> {message.to}</p><p className="mt-2"><strong>Subject:</strong> {message.subject}</p></div><DialogFooter><Button type="button" variant="outline" onClick={() => setConfirming(false)}>Cancel</Button><Button type="submit" disabled={busy}><Send className="h-4 w-4" />{busy ? "Sending…" : "Confirm & send"}</Button></DialogFooter></form></DialogContent></Dialog>
  </div>;
}
