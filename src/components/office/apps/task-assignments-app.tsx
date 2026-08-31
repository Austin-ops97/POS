"use client";

import { FormEvent, useMemo, useState } from "react";
import { CheckCircle2, ListTodo, UserRound } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { OfficeSuiteModule } from "@/lib/office/suite";
import type { OfficeWorkspaceRecordSummary } from "@/lib/office/workspace-service";
import { OfficeAppHeader } from "./app-header";
import {
  createWorkspaceRecord,
  recordMetadata,
  updateWorkspaceRecord,
  type EmployeeOption,
  type OfficeAppPermissions,
} from "./record-client";

type TaskData = {
  kind: "task";
  notes: string;
  assignedToId: string | null;
  dueAt: string;
  done: boolean;
};

const localInput = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

function fresh(): TaskData {
  const due = new Date();
  due.setHours(due.getHours() + 4, 0, 0, 0);
  return { kind: "task", notes: "", assignedToId: null, dueAt: localInput(due), done: false };
}

export function TaskAssignmentsApp({
  module,
  initialRecords,
  employees,
  permissions,
}: {
  module: OfficeSuiteModule;
  initialRecords: OfficeWorkspaceRecordSummary[];
  employees: EmployeeOption[];
  permissions: OfficeAppPermissions;
}) {
  const [records, setRecords] = useState(initialRecords);
  const [editing, setEditing] = useState<OfficeWorkspaceRecordSummary | null | undefined>(undefined);
  const [draft, setDraft] = useState<TaskData>(fresh());
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const tasks = useMemo(
    () =>
      records
        .map((record) => ({ record, data: recordMetadata<TaskData>(record, fresh()) }))
        .sort((a, b) => a.data.dueAt.localeCompare(b.data.dueAt)),
    [records]
  );

  const grouped = useMemo(() => {
    const byWorker = new Map<string, typeof tasks>();
    for (const item of tasks) {
      const key = item.record.assignedTo?.id ?? item.data.assignedToId ?? "unassigned";
      const list = byWorker.get(key) ?? [];
      list.push(item);
      byWorker.set(key, list);
    }
    const named = employees
      .map((employee) => ({
        employee,
        items: byWorker.get(employee.id) ?? [],
      }))
      .filter((group) => group.items.length > 0);
    const unassigned = byWorker.get("unassigned") ?? [];
    return { named, unassigned };
  }, [tasks, employees]);

  function open(record?: OfficeWorkspaceRecordSummary) {
    if (record) {
      const data = recordMetadata<TaskData>(record, fresh());
      setEditing(record);
      setDraft({ ...data, assignedToId: record.assignedTo?.id ?? data.assignedToId });
      setTitle(record.title);
    } else {
      setEditing(null);
      setDraft(fresh());
      setTitle("");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return toast.error("Add a task title");
    if (!draft.assignedToId) return toast.error("Assign this task to a worker");
    setBusy(true);
    const worker = employees.find((employee) => employee.id === draft.assignedToId);
    const assignmentTitle = `Task assignment for ${worker?.name ?? "worker"}`;
    try {
      const payload = {
        title: title.trim(),
        summary: assignmentTitle,
        dueAt: new Date(draft.dueAt).toISOString(),
        assignedToId: draft.assignedToId,
        status: draft.done ? "COMPLETE" : "ACTIVE",
        metadata: { ...draft, kind: "task" as const },
      };
      const saved = editing
        ? await updateWorkspaceRecord(module.slug, editing.id, payload)
        : await createWorkspaceRecord(module.slug, payload);
      setRecords((items) =>
        editing ? items.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...items]
      );
      setEditing(undefined);
      toast.success("Task assignment saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save task");
    } finally {
      setBusy(false);
    }
  }

  async function toggleDone(record: OfficeWorkspaceRecordSummary) {
    const data = recordMetadata<TaskData>(record, fresh());
    try {
      const saved = await updateWorkspaceRecord(module.slug, record.id, {
        status: data.done ? "ACTIVE" : "COMPLETE",
        metadata: { ...data, done: !data.done },
      });
      setRecords((items) => items.map((item) => (item.id === saved.id ? saved : item)));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update task");
    }
  }

  return (
    <div className="space-y-5 pb-8">
      <OfficeAppHeader module={module}>
        <Button type="button" onClick={() => open()} disabled={!permissions.canCreate}>
          <ListTodo className="h-4 w-4" />
          Assign a task
        </Button>
      </OfficeAppHeader>

      <div className="space-y-6">
        {grouped.named.map(({ employee, items }) => (
          <section key={employee.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <header className="flex items-center justify-between border-b border-teal-100 bg-teal-50 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">Task assignment for</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-950">{employee.name}</h2>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-sm text-teal-800">
                {items.filter((item) => !item.data.done).length} open
              </span>
            </header>
            <ul className="divide-y divide-slate-100">
              {items.map(({ record, data }) => (
                <li key={record.id} className="flex items-stretch">
                  <button
                    type="button"
                    onClick={() => toggleDone(record)}
                    className="flex w-14 items-center justify-center text-slate-400 hover:bg-teal-50 hover:text-teal-700"
                    aria-label={data.done ? "Mark open" : "Mark done"}
                  >
                    <CheckCircle2 className={`h-5 w-5 ${data.done ? "text-teal-600" : ""}`} />
                  </button>
                  <button type="button" onClick={() => open(record)} className="flex min-w-0 flex-1 items-center justify-between gap-4 px-4 py-4 text-left hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className={`font-medium ${data.done ? "text-slate-400 line-through" : "text-slate-900"}`}>
                        {record.title}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Due {format(new Date(data.dueAt), "EEE, MMM d · h:mm a")}
                        {data.notes ? ` · ${data.notes}` : ""}
                      </p>
                    </div>
                    <span className="text-sm text-teal-700">Edit</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {grouped.unassigned.length ? (
          <section className="rounded-2xl border border-dashed border-slate-300 p-5">
            <h2 className="font-semibold text-slate-800">Unassigned</h2>
            <ul className="mt-3 space-y-2">
              {grouped.unassigned.map(({ record }) => (
                <li key={record.id}>
                  <button type="button" onClick={() => open(record)} className="text-sm text-slate-700 underline">
                    {record.title}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {!tasks.length ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <ListTodo className="mx-auto h-9 w-9 text-slate-300" />
            <h3 className="mt-3 font-semibold">No task assignments yet</h3>
            <p className="mt-1 text-sm text-slate-500">Assign a task to a worker and it will appear in their list.</p>
            <Button type="button" className="mt-4" onClick={() => open()}>
              Assign a task
            </Button>
          </div>
        ) : null}
      </div>

      <Dialog
        open={editing !== undefined}
        onOpenChange={(openState) => {
          if (!openState) setEditing(undefined);
        }}
      >
        <DialogContent>
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit task assignment" : "Assign a task"}</DialogTitle>
              <DialogDescription>Saved like an appointment, grouped under the worker it is assigned to.</DialogDescription>
            </DialogHeader>
            <div className="my-5 grid gap-4">
              <label className="text-sm font-medium">
                Task
                <Input required value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" placeholder="What needs to be done?" />
              </label>
              <label className="text-sm font-medium">
                Assign to worker
                <select
                  required
                  value={draft.assignedToId ?? ""}
                  onChange={(e) => setDraft((current) => ({ ...current, assignedToId: e.target.value || null }))}
                  className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3"
                >
                  <option value="">Choose a worker</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium">
                Due
                <Input
                  required
                  type="datetime-local"
                  value={draft.dueAt}
                  onChange={(e) => setDraft((current) => ({ ...current, dueAt: e.target.value }))}
                  className="mt-1"
                />
              </label>
              <label className="text-sm font-medium">
                Notes
                <Textarea
                  value={draft.notes}
                  onChange={(e) => setDraft((current) => ({ ...current, notes: e.target.value }))}
                  className="mt-1"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={draft.done}
                  onChange={(e) => setDraft((current) => ({ ...current, done: e.target.checked }))}
                />
                Mark as done
              </label>
              {draft.assignedToId ? (
                <p className="flex items-center gap-2 rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900">
                  <UserRound className="h-4 w-4" />
                  Task assignment for {employees.find((employee) => employee.id === draft.assignedToId)?.name}
                </p>
              ) : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(undefined)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save assignment"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
