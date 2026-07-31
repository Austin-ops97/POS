"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock3,
  ExternalLink,
  LayoutGrid,
  ListFilter,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
  UserRound,
  WandSparkles,
} from "lucide-react";
import { format, formatDistanceToNow, isPast } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { OfficeSuiteModule } from "@/lib/office/suite";
import type { OfficeWorkspaceRecordSummary } from "@/lib/office/workspace-service";
import { OFFICE_ACCENTS, OFFICE_SUITE_ICONS } from "./office-suite-icons";

type Props = {
  module: OfficeSuiteModule;
  initialRecords: OfficeWorkspaceRecordSummary[];
  employees: Array<{ id: string; name: string }>;
  permissions: { canCreate: boolean; canEdit: boolean; canDelete: boolean };
};

const statuses = ["ACTIVE", "NEEDS_REVIEW", "WAITING", "COMPLETE"] as const;

const statusLabels: Record<string, string> = {
  DRAFT: "Draft",
  ACTIVE: "In progress",
  NEEDS_REVIEW: "Needs review",
  WAITING: "Waiting",
  COMPLETE: "Complete",
};

const statusStyles: Record<string, string> = {
  DRAFT: "border-slate-200 bg-slate-100 text-slate-600",
  ACTIVE: "border-blue-200 bg-blue-50 text-blue-700",
  NEEDS_REVIEW: "border-amber-200 bg-amber-50 text-amber-700",
  WAITING: "border-violet-200 bg-violet-50 text-violet-700",
  COMPLETE: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

const priorityStyles: Record<string, string> = {
  LOW: "text-slate-600",
  NORMAL: "text-slate-500",
  HIGH: "text-orange-800",
  URGENT: "text-red-600",
};

async function responseError(response: Response) {
  const body = await response.json().catch(() => null);
  return body?.error ?? "The request could not be completed";
}

export function OfficeModuleWorkspace({ module, initialRecords, employees, permissions }: Props) {
  const Icon = OFFICE_SUITE_ICONS[module.icon];
  const accent = OFFICE_ACCENTS[module.accent] ?? OFFICE_ACCENTS.slate;
  const [records, setRecords] = useState(initialRecords);
  const [activeView, setActiveView] = useState(module.views[0]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>("OPEN");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(module.templates[0]);
  const [submitting, setSubmitting] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<OfficeWorkspaceRecordSummary | null>(null);
  const [assistantPrompt, setAssistantPrompt] = useState("");
  const [assistantResult, setAssistantResult] = useState<string | null>(null);

  const visibleRecords = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return records.filter((record) => {
      if (status === "OPEN" && record.status === "COMPLETE") return false;
      if (status !== "ALL" && status !== "OPEN" && record.status !== status) return false;
      return !normalized || `${record.title} ${record.summary ?? ""} ${record.createdBy.name} ${record.assignedTo?.name ?? ""}`.toLowerCase().includes(normalized);
    });
  }, [query, records, status]);

  const counts = useMemo(() => ({
    open: records.filter((record) => record.status !== "COMPLETE").length,
    review: records.filter((record) => record.status === "NEEDS_REVIEW").length,
    complete: records.filter((record) => record.status === "COMPLETE").length,
    overdue: records.filter((record) => record.status !== "COMPLETE" && record.dueAt && isPast(new Date(record.dueAt))).length,
  }), [records]);

  function openTemplate(template: (typeof module.templates)[number]) {
    setSelectedTemplate(template);
    setCreateOpen(true);
  }

  async function createRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/office/workspaces/${module.slug}/records`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.get("title"),
          summary: form.get("summary") || null,
          priority: form.get("priority"),
          status: "ACTIVE",
          assignedToId: form.get("assignedToId") || null,
          dueAt: form.get("dueAt") ? new Date(String(form.get("dueAt"))).toISOString() : null,
          metadata: { template: selectedTemplate.name, source: "office-suite" },
        }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const record = await response.json();
      setRecords((items) => [record, ...items]);
      setCreateOpen(false);
      toast.success(`${module.name} record created`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create record");
    } finally {
      setSubmitting(false);
    }
  }

  async function changeStatus(record: OfficeWorkspaceRecordSummary, nextStatus: string) {
    if (!permissions.canEdit || nextStatus === record.status) return;
    const previous = record.status;
    setRecords((items) => items.map((item) => item.id === record.id ? { ...item, status: nextStatus } : item));
    const response = await fetch(`/api/office/workspaces/${module.slug}/records/${record.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (!response.ok) {
      setRecords((items) => items.map((item) => item.id === record.id ? { ...item, status: previous } : item));
      toast.error(await responseError(response));
      return;
    }
    const updated = await response.json();
    setRecords((items) => items.map((item) => item.id === record.id ? updated : item));
    toast.success(nextStatus === "COMPLETE" ? "Marked complete" : "Status updated");
  }

  async function archiveRecord() {
    if (!archiveTarget) return;
    setSubmitting(true);
    const response = await fetch(`/api/office/workspaces/${module.slug}/records/${archiveTarget.id}`, { method: "DELETE" });
    if (!response.ok) {
      toast.error(await responseError(response));
      setSubmitting(false);
      return;
    }
    setRecords((items) => items.filter((item) => item.id !== archiveTarget.id));
    setArchiveTarget(null);
    setSubmitting(false);
    toast.success("Record archived");
  }

  function prepareAssistantDraft(event: FormEvent) {
    event.preventDefault();
    const prompt = assistantPrompt.trim();
    if (!prompt) return;
    const suggested = module.templates.find((template) =>
      prompt.toLowerCase().includes(template.name.toLowerCase().split(" ")[0])
    ) ?? module.templates[0];
    setSelectedTemplate(suggested);
    setAssistantResult(`I prepared a ${suggested.name.toLowerCase()} starting point. Review the title, owner, due date, and summary before creating it—nothing has been sent or committed.`);
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <Link href="/office" className="inline-flex items-center gap-1 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" />Office & Admin</Link>
        <span>/</span><span className="font-medium text-slate-700">{module.name}</span>
      </div>

      <section className={cn("relative overflow-hidden rounded-[1.6rem] border p-5 sm:p-7", accent.soft, accent.border)}>
        <div className="pointer-events-none absolute -right-12 -top-20 h-52 w-52 rounded-full bg-white/60 blur-2xl" />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className={cn("inline-flex rounded-xl p-2.5 text-white shadow-sm", accent.icon)}><Icon className="h-5 w-5" /></div>
            <p className={cn("mt-4 text-xs font-semibold uppercase tracking-[0.14em]", accent.text)}>{module.eyebrow}</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-4xl">{module.name}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">{module.description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {module.nativeHref ? <Button asChild variant="outline" className="rounded-xl border-white bg-white/80"><Link href={module.nativeHref}>{module.nativeLabel}<ExternalLink className="h-4 w-4" /></Link></Button> : null}
            {permissions.canCreate ? <Button type="button" className="rounded-xl bg-slate-900 text-white hover:bg-slate-800" onClick={() => openTemplate(module.templates[0])}><Plus className="h-4 w-4" />Create new</Button> : null}
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={`${module.name} summary`}>
        {[
          { label: "Open", value: counts.open, icon: Circle, color: "text-blue-600" },
          { label: "Needs review", value: counts.review, icon: Sparkles, color: "text-amber-600" },
          { label: "Overdue", value: counts.overdue, icon: Clock3, color: "text-red-600" },
          { label: "Completed", value: counts.complete, icon: CheckCircle2, color: "text-emerald-600" },
        ].map(({ label, value, icon: StatIcon, color }) => <div key={label} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4"><div className="rounded-xl bg-slate-50 p-2.5"><StatIcon className={cn("h-5 w-5", color)} /></div><div><p className="text-2xl font-semibold text-slate-950">{value}</p><p className="text-xs text-slate-500">{label}</p></div></div>)}
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Quick start</p><h2 className="mt-1 text-xl font-semibold text-slate-950">Start with a proven workflow</h2></div></div>
        <div className="grid gap-3 md:grid-cols-3">
          {module.templates.map((template, index) => <button key={template.name} type="button" disabled={!permissions.canCreate} onClick={() => openTemplate(template)} className="group rounded-2xl border border-slate-200 bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"><div className="flex items-center justify-between"><span className={cn("flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold", accent.soft, accent.text)}>0{index + 1}</span><ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-600" /></div><h3 className="mt-4 font-semibold text-slate-900">{template.name}</h3><p className="mt-1 text-sm leading-5 text-slate-500">{template.description}</p></button>)}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 pt-2 sm:px-5">
          <div className="flex gap-1 overflow-x-auto">
            {module.views.map((view) => <button key={view} type="button" onClick={() => setActiveView(view)} className={cn("relative shrink-0 px-3 py-3 text-sm font-medium", activeView === view ? "text-slate-950" : "text-slate-500 hover:text-slate-800")}><span>{view}</span>{activeView === view ? <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-slate-900" /> : null}</button>)}
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${module.name.toLowerCase()}…`} className="h-11 rounded-xl pl-9" /></div>
            <div className="flex gap-2 overflow-x-auto">
              {[
                ["OPEN", "Open"], ["NEEDS_REVIEW", "Review"], ["WAITING", "Waiting"], ["COMPLETE", "Complete"], ["ALL", "All"],
              ].map(([value, label]) => <button key={value} type="button" onClick={() => setStatus(value)} className={cn("shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold", status === value ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-500 hover:bg-slate-50")}><ListFilter className="mr-1.5 inline h-3.5 w-3.5" />{label}</button>)}
            </div>
          </div>

          {visibleRecords.length ? (
            <div className="mt-4 space-y-2">
              {visibleRecords.map((record) => {
                const overdue = record.status !== "COMPLETE" && record.dueAt && isPast(new Date(record.dueAt));
                return <article key={record.id} className="group flex flex-col gap-3 rounded-xl border border-slate-200 p-4 transition hover:border-slate-300 sm:flex-row sm:items-center">
                  <button type="button" disabled={!permissions.canEdit} onClick={() => void changeStatus(record, record.status === "COMPLETE" ? "ACTIVE" : "COMPLETE")} className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full border", record.status === "COMPLETE" ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 text-transparent hover:border-emerald-500 hover:text-emerald-500")} aria-label={record.status === "COMPLETE" ? "Reopen record" : "Mark record complete"}><Check className="h-4 w-4" /></button>
                  <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className={cn("font-medium text-slate-900", record.status === "COMPLETE" && "text-slate-600 line-through")}>{record.title}</h3>{record.priority !== "NORMAL" ? <span className={cn("text-[10px] font-bold uppercase tracking-wide", priorityStyles[record.priority])}>{record.priority}</span> : null}</div>{record.summary ? <p className="mt-1 line-clamp-1 text-sm text-slate-500">{record.summary}</p> : null}<div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-600"><span className="inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />{record.assignedTo?.name || record.createdBy.name}</span>{record.dueAt ? <span className={cn("inline-flex items-center gap-1", overdue && "font-semibold text-red-600")}><CalendarClock className="h-3.5 w-3.5" />{overdue ? "Overdue · " : ""}{format(new Date(record.dueAt), "MMM d")}</span> : null}<span>Updated {formatDistanceToNow(new Date(record.updatedAt), { addSuffix: true })}</span></div></div>
                  <div className="flex shrink-0 items-center gap-2"><div className="relative"><select value={record.status} disabled={!permissions.canEdit} aria-label={`Status for ${record.title}`} onChange={(event) => void changeStatus(record, event.target.value)} className={cn("h-9 appearance-none rounded-lg border py-1.5 pl-3 pr-8 text-xs font-semibold outline-none focus:ring-2 focus:ring-slate-300", statusStyles[record.status])}>{statuses.map((value) => <option key={value} value={value}>{statusLabels[value]}</option>)}</select><ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 opacity-60" /></div>{permissions.canDelete ? <button type="button" onClick={() => setArchiveTarget(record)} className="rounded-lg p-2 text-slate-300 opacity-0 hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 focus:opacity-100" aria-label={`Archive ${record.title}`}><Trash2 className="h-4 w-4" /></button> : <MoreHorizontal className="h-4 w-4 text-slate-300" />}</div>
                </article>;
              })}
            </div>
          ) : <div className="mt-4 flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-8 text-center"><LayoutGrid className="h-8 w-8 text-slate-300" /><h3 className="mt-3 font-semibold text-slate-800">No records in this view</h3><p className="mt-1 max-w-md text-sm text-slate-500">Start from a template or adjust the search and status filters.</p>{permissions.canCreate ? <Button type="button" variant="outline" className="mt-4 rounded-xl bg-white" onClick={() => openTemplate(module.templates[0])}><Plus className="h-4 w-4" />Create the first record</Button> : null}</div>}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(20rem,1fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Included capabilities</p><h2 className="mt-1 text-lg font-semibold text-slate-950">Built for the complete workflow</h2></div><Icon className="h-5 w-5 text-slate-300" /></div><div className="mt-5 grid gap-x-6 gap-y-3 sm:grid-cols-2">{module.features.map((feature) => <div key={feature} className="flex items-start gap-2.5"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /><span className="text-sm leading-5 text-slate-600">{feature}</span></div>)}</div></div>
        <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-white p-5 sm:p-6"><div className="flex items-center gap-3"><div className="rounded-xl bg-violet-600 p-2.5 text-white"><Bot className="h-5 w-5" /></div><div><p className="font-semibold text-slate-900">Nexa Assist</p><p className="text-xs text-slate-500">Prepares; you approve</p></div></div><p className="mt-4 text-sm leading-6 text-slate-600">Describe the outcome you need. Nexa will choose a safe starting workflow and leave consequential actions for your confirmation.</p><form onSubmit={prepareAssistantDraft} className="mt-4"><Textarea value={assistantPrompt} onChange={(event) => setAssistantPrompt(event.target.value)} placeholder={`Example: Prepare a ${module.templates[0].name.toLowerCase()} for review…`} className="min-h-24 rounded-xl border-violet-200 bg-white" /><Button type="submit" className="mt-2 w-full rounded-xl bg-violet-600 hover:bg-violet-700"><WandSparkles className="h-4 w-4" />Prepare draft</Button></form>{assistantResult ? <div className="mt-3 rounded-xl border border-violet-100 bg-white p-3"><p className="text-sm leading-5 text-slate-600">{assistantResult}</p><button type="button" onClick={() => setCreateOpen(true)} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-violet-700">Review draft <ArrowRight className="h-3.5 w-3.5" /></button></div> : null}</div>
      </section>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Create {selectedTemplate.name}</DialogTitle><DialogDescription>{selectedTemplate.description} You can adjust every field before saving.</DialogDescription></DialogHeader>
          <form onSubmit={createRecord}>
            <div className="space-y-4">
              <div className="space-y-1.5"><Label htmlFor="record-title">Title</Label><Input id="record-title" name="title" required maxLength={160} defaultValue={selectedTemplate.name} autoFocus className="rounded-xl" /></div>
              <div className="space-y-1.5"><Label htmlFor="record-summary">Summary or instructions</Label><Textarea id="record-summary" name="summary" maxLength={2000} defaultValue={selectedTemplate.description} className="min-h-28 rounded-xl" /></div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5"><Label htmlFor="record-owner">Owner</Label><select id="record-owner" name="assignedToId" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-400"><option value="">Me</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></div>
                <div className="space-y-1.5"><Label htmlFor="record-due">Due date</Label><Input id="record-due" name="dueAt" type="date" className="rounded-xl" /></div>
                <div className="space-y-1.5"><Label htmlFor="record-priority">Priority</Label><select id="record-priority" name="priority" defaultValue="NORMAL" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-400"><option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select></div>
              </div>
              <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500"><ShieldNotice /><span>This saves an internal record only. No message, payment, signature request, or external action will occur.</span></div>
            </div>
            <DialogFooter><Button type="button" variant="outline" disabled={submitting} onClick={() => setCreateOpen(false)}>Cancel</Button><Button type="submit" disabled={submitting}>{submitting ? "Creating…" : "Create record"}<Send className="h-4 w-4" /></Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={Boolean(archiveTarget)} onOpenChange={(open) => { if (!open) setArchiveTarget(null); }} title="Archive this record?" description={`“${archiveTarget?.title ?? "This record"}” will leave active views but remain represented in the audit history.`} confirmLabel="Archive record" variant="destructive" loading={submitting} onConfirm={archiveRecord} />
    </div>
  );
}

function ShieldNotice() {
  return <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700">✓</span>;
}
