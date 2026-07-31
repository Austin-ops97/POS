"use client";

import { FormEvent, useMemo, useState } from "react";
import { AlertTriangle, CalendarPlus, CheckCircle2, Clock, MapPin, UserRound } from "lucide-react";
import { format, isSameDay } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { OfficeSuiteModule } from "@/lib/office/suite";
import type { OfficeWorkspaceRecordSummary } from "@/lib/office/workspace-service";
import { appointmentsConflict } from "@/lib/office/calendar";
import { OfficeAppHeader } from "./app-header";
import { createWorkspaceRecord, recordMetadata, updateWorkspaceRecord, type EmployeeOption, type OfficeAppPermissions } from "./record-client";

type AppointmentData = { customer: string; startsAt: string; endsAt: string; location: string; notes: string; assignedToId: string | null };
const localInput = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const fresh = (): AppointmentData => { const start = new Date(); start.setMinutes(Math.ceil(start.getMinutes() / 30) * 30, 0, 0); const end = new Date(start.getTime() + 3600000); return { customer: "", startsAt: localInput(start), endsAt: localInput(end), location: "", notes: "", assignedToId: null }; };

export function CalendarApp({ module, initialRecords, employees, permissions }: { module: OfficeSuiteModule; initialRecords: OfficeWorkspaceRecordSummary[]; employees: EmployeeOption[]; permissions: OfficeAppPermissions }) {
  const [records, setRecords] = useState(initialRecords);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [editing, setEditing] = useState<OfficeWorkspaceRecordSummary | null | undefined>(undefined);
  const [draft, setDraft] = useState<AppointmentData>(fresh());
  const [busy, setBusy] = useState(false);
  const appointments = useMemo(() => records.map((record) => ({ record, data: recordMetadata<AppointmentData>(record, fresh()) })).sort((a, b) => a.data.startsAt.localeCompare(b.data.startsAt)), [records]);
  const dayAppointments = appointments.filter(({ data }) => isSameDay(new Date(data.startsAt), selectedDate));
  const conflicts = appointmentsConflict({ id: editing?.id, ...draft }, appointments.map(({ record, data }) => ({ id: record.id, ...data })));
  function open(record?: OfficeWorkspaceRecordSummary) { setEditing(record ?? null); setDraft(record ? recordMetadata(record, fresh()) : fresh()); }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (new Date(draft.endsAt) <= new Date(draft.startsAt)) return toast.error("End time must be after start time");
    if (conflicts.length) return toast.error("Resolve the schedule conflict before saving");
    setBusy(true);
    try {
      const payload = { title: draft.customer, summary: [draft.location, draft.notes].filter(Boolean).join(" · "), dueAt: new Date(draft.startsAt).toISOString(), assignedToId: draft.assignedToId, metadata: draft };
      const saved = editing ? await updateWorkspaceRecord(module.slug, editing.id, payload) : await createWorkspaceRecord(module.slug, payload);
      setRecords((items) => editing ? items.map((item) => item.id === saved.id ? saved : item) : [...items, saved]); setEditing(undefined); setSelectedDate(new Date(draft.startsAt)); toast.success("Appointment saved");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save appointment"); } finally { setBusy(false); }
  }
  const week = Array.from({ length: 7 }, (_, i) => { const date = new Date(selectedDate); date.setDate(selectedDate.getDate() - selectedDate.getDay() + i); return date; });
  return <div className="space-y-5 pb-8">
    <OfficeAppHeader module={module}><Button onClick={() => open()} disabled={!permissions.canCreate}><CalendarPlus className="h-4 w-4" />Book appointment</Button></OfficeAppHeader>
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="grid grid-cols-7 border-b bg-indigo-950 text-white">{week.map((date) => <button key={date.toISOString()} onClick={() => setSelectedDate(date)} className={`p-3 text-center sm:p-5 ${isSameDay(date, selectedDate) ? "bg-indigo-600" : "hover:bg-white/10"}`}><span className="block text-[10px] font-semibold uppercase tracking-wider text-indigo-200">{format(date, "EEE")}</span><span className="mt-1 block text-xl font-semibold">{format(date, "d")}</span></button>)}</div>
      <div className="grid min-h-[520px] lg:grid-cols-[1fr_320px]">
        <main className="p-5 sm:p-7">
          <div className="flex items-end justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Daily schedule</p><h2 className="mt-1 text-2xl font-semibold">{format(selectedDate, "EEEE, MMMM d")}</h2></div><span className="text-sm text-slate-500">{dayAppointments.length} appointment{dayAppointments.length === 1 ? "" : "s"}</span></div>
          <div className="mt-6 space-y-3">{dayAppointments.map(({ record, data }) => <button key={record.id} onClick={() => open(record)} className="group flex w-full items-stretch overflow-hidden rounded-xl border border-slate-200 text-left hover:border-indigo-300 hover:shadow-sm"><div className="w-2 bg-indigo-500" /><div className="w-28 bg-slate-50 p-4 text-center"><span className="block font-semibold text-slate-900">{format(new Date(data.startsAt), "h:mm")}</span><span className="text-xs text-slate-500">{format(new Date(data.startsAt), "a")}</span></div><div className="flex-1 p-4"><h3 className="font-semibold text-slate-900">{data.customer || record.title}</h3><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">{record.assignedTo ? <span><UserRound className="mr-1 inline h-3.5 w-3.5" />{record.assignedTo.name}</span> : null}{data.location ? <span><MapPin className="mr-1 inline h-3.5 w-3.5" />{data.location}</span> : null}<span><Clock className="mr-1 inline h-3.5 w-3.5" />until {format(new Date(data.endsAt), "h:mm a")}</span></div></div><div className="hidden items-center p-4 text-indigo-600 sm:flex">Edit</div></button>)}{!dayAppointments.length ? <div className="rounded-2xl border border-dashed border-slate-300 p-12 text-center"><CalendarPlus className="mx-auto h-9 w-9 text-slate-300" /><h3 className="mt-3 font-semibold">This day is open</h3><p className="mt-1 text-sm text-slate-500">Book an appointment and it will appear here.</p><Button className="mt-4" onClick={() => open()}>Book appointment</Button></div> : null}</div>
        </main>
        <aside className="border-t border-slate-200 bg-slate-50 p-5 lg:border-l lg:border-t-0"><h2 className="font-semibold">Schedule overview</h2><div className="mt-4 space-y-3">{week.map((date) => { const count = appointments.filter(({ data }) => isSameDay(new Date(data.startsAt), date)).length; return <button key={date.toISOString()} onClick={() => setSelectedDate(date)} className="flex w-full items-center justify-between rounded-xl bg-white p-3 text-sm shadow-sm"><span>{format(date, "EEEE")}</span><span className={`rounded-full px-2 py-0.5 text-xs ${count ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500"}`}>{count}</span></button>; })}</div><div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><CheckCircle2 className="h-5 w-5 text-emerald-700" /><p className="mt-2 text-sm font-semibold text-emerald-900">Conflict protection is on</p><p className="mt-1 text-xs leading-5 text-emerald-700">Overlapping appointments assigned to the same person cannot be saved.</p></div></aside>
      </div>
    </div>
    <Dialog open={editing !== undefined} onOpenChange={(open) => { if (!open) setEditing(undefined); }}><DialogContent><form onSubmit={submit}><DialogHeader><DialogTitle>{editing ? "Edit appointment" : "Book appointment"}</DialogTitle><DialogDescription>Times are saved in your current time zone. Conflicts are checked before saving.</DialogDescription></DialogHeader><div className="my-5 grid gap-4"><label className="text-sm font-medium">Customer or appointment name<Input required value={draft.customer} onChange={(e) => setDraft((d) => ({ ...d, customer: e.target.value }))} className="mt-1" /></label><div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">Starts<Input required type="datetime-local" value={draft.startsAt} onChange={(e) => setDraft((d) => ({ ...d, startsAt: e.target.value }))} className="mt-1" /></label><label className="text-sm font-medium">Ends<Input required type="datetime-local" value={draft.endsAt} onChange={(e) => setDraft((d) => ({ ...d, endsAt: e.target.value }))} className="mt-1" /></label></div><label className="text-sm font-medium">Assigned team member<select value={draft.assignedToId ?? ""} onChange={(e) => setDraft((d) => ({ ...d, assignedToId: e.target.value || null }))} className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3"><option value="">Unassigned</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label><label className="text-sm font-medium">Location<Input value={draft.location} onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))} className="mt-1" /></label><label className="text-sm font-medium">Notes<Input value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} className="mt-1" /></label>{conflicts.length ? <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="h-5 w-5 shrink-0" /><span>This team member already has {conflicts.length} overlapping appointment{conflicts.length === 1 ? "" : "s"}.</span></div> : null}</div><DialogFooter><Button type="button" variant="outline" onClick={() => setEditing(undefined)}>Cancel</Button><Button type="submit" disabled={busy || !!conflicts.length}>{busy ? "Saving…" : "Save appointment"}</Button></DialogFooter></form></DialogContent></Dialog>
  </div>;
}
