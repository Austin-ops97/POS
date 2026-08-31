"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle2, ImagePlus, ListTodo, Trash2, UserRound } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  MAX_TASK_COMPLETION_PHOTOS,
  emptyTaskData,
  normalizeChecklist,
  splitTaskRecords,
  validateTaskCompletion,
  type TaskData,
  type TaskPhoto,
} from "@/lib/office/task-assignments";
import { OfficeAppHeader } from "./app-header";
import {
  archiveWorkspaceRecord,
  clearCompletedWorkspaceRecords,
  createWorkspaceRecord,
  recordMetadata,
  updateWorkspaceRecord,
  type EmployeeOption,
  type OfficeAppPermissions,
} from "./record-client";

const localInput = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

function fresh(): TaskData {
  const due = new Date();
  due.setHours(due.getHours() + 4, 0, 0, 0);
  return emptyTaskData(localInput(due));
}

function readTask(record?: OfficeWorkspaceRecordSummary): TaskData {
  const data = recordMetadata<TaskData>(record, fresh());
  return {
    ...fresh(),
    ...data,
    kind: "task",
    checklist: normalizeChecklist(data.checklist),
    completion: data.completion ?? null,
    assignedToId: record?.assignedTo?.id ?? data.assignedToId ?? null,
  };
}

function compressImageFile(file: File): Promise<TaskPhoto> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const max = 1280;
      let width = image.width;
      let height = image.height;
      if (width > max || height > max) {
        const scale = max / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")?.drawImage(image, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve({
        id: crypto.randomUUID(),
        name: file.name || "photo.jpg",
        mimeType: "image/jpeg",
        dataUrl: canvas.toDataURL("image/jpeg", 0.72),
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that photo"));
    };
    image.src = url;
  });
}

export function TaskAssignmentsApp({
  module,
  initialRecords,
  employees,
  permissions,
  currentEmployeeId,
  currentEmployeeName,
}: {
  module: OfficeSuiteModule;
  initialRecords: OfficeWorkspaceRecordSummary[];
  employees: EmployeeOption[];
  permissions: OfficeAppPermissions;
  currentEmployeeId: string;
  currentEmployeeName: string;
}) {
  const [records, setRecords] = useState(initialRecords);
  const [tab, setTab] = useState<"open" | "finished">("open");
  const [editing, setEditing] = useState<OfficeWorkspaceRecordSummary | null | undefined>(undefined);
  const [completing, setCompleting] = useState<OfficeWorkspaceRecordSummary | null>(null);
  const [draft, setDraft] = useState<TaskData>(fresh());
  const [title, setTitle] = useState("");
  const [checklistDraft, setChecklistDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [checkedItems, setCheckedItems] = useState<string[]>([]);
  const [completionNote, setCompletionNote] = useState("");
  const [photos, setPhotos] = useState<TaskPhoto[]>([]);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [clearFinishedOpen, setClearFinishedOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const tasks = useMemo(
    () =>
      records
        .map((record) => ({ record, data: readTask(record) }))
        .sort((a, b) => a.data.dueAt.localeCompare(b.data.dueAt)),
    [records]
  );
  const { open, finished } = useMemo(() => splitTaskRecords(tasks), [tasks]);

  function groupByWorker(list: typeof tasks) {
    const byWorker = new Map<string, typeof tasks>();
    for (const item of list) {
      const key = item.record.assignedTo?.id ?? item.data.assignedToId ?? "unassigned";
      const next = byWorker.get(key) ?? [];
      next.push(item);
      byWorker.set(key, next);
    }
    const named = employees
      .map((employee) => ({ employee, items: byWorker.get(employee.id) ?? [] }))
      .filter((group) => group.items.length > 0);
    return { named, unassigned: byWorker.get("unassigned") ?? [] };
  }

  const openGrouped = useMemo(() => groupByWorker(open), [open, employees]);
  const finishedGrouped = useMemo(() => groupByWorker(finished), [finished, employees]);
  const canRemove = permissions.canDelete || permissions.canCreate;

  function openEditor(record?: OfficeWorkspaceRecordSummary) {
    if (record) {
      const data = readTask(record);
      setEditing(record);
      setDraft(data);
      setTitle(record.title);
    } else {
      setEditing(null);
      setDraft(fresh());
      setTitle("");
    }
    setChecklistDraft("");
  }

  function openComplete(record: OfficeWorkspaceRecordSummary) {
    const data = readTask(record);
    setCompleting(record);
    setConfirmed(false);
    setCheckedItems([]);
    setCompletionNote("");
    setPhotos(data.completion?.photos ?? []);
  }

  async function submitAssignment(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return toast.error("Add a task title");
    if (!draft.assignedToId) return toast.error("Assign this task to a worker");
    setBusy(true);
    const worker = employees.find((employee) => employee.id === draft.assignedToId);
    try {
      const payload = {
        title: title.trim(),
        summary: `Task assignment for ${worker?.name ?? "worker"}`,
        dueAt: new Date(draft.dueAt).toISOString(),
        assignedToId: draft.assignedToId,
        status: draft.done ? "COMPLETE" : "ACTIVE",
        metadata: {
          ...draft,
          kind: "task" as const,
          checklist: normalizeChecklist(draft.checklist),
        },
      };
      const saved = editing
        ? await updateWorkspaceRecord(module.slug, editing.id, payload)
        : await createWorkspaceRecord(module.slug, payload);
      setRecords((items) =>
        editing ? items.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...items]
      );
      setEditing(undefined);
      toast.success(editing ? "Task updated" : "Task assigned — they will get a notification");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save task");
    } finally {
      setBusy(false);
    }
  }

  async function submitCompletion(event: FormEvent) {
    event.preventDefault();
    if (!completing) return;
    const data = readTask(completing);
    const error = validateTaskCompletion({
      confirmed,
      checklist: data.checklist,
      checkedItems,
    });
    if (error) return toast.error(error);
    setBusy(true);
    try {
      const saved = await updateWorkspaceRecord(module.slug, completing.id, {
        status: "COMPLETE",
        metadata: {
          ...data,
          done: true,
          completion: {
            verified: true,
            note: completionNote.trim(),
            completedAt: new Date().toISOString(),
            completedByName: currentEmployeeName,
            photos,
            checkedItems,
          },
        },
      });
      setRecords((items) => items.map((item) => (item.id === saved.id ? saved : item)));
      setCompleting(null);
      setTab("finished");
      toast.success("Task moved to Finished");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not complete task");
    } finally {
      setBusy(false);
    }
  }

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    const remaining = MAX_TASK_COMPLETION_PHOTOS - photos.length;
    if (remaining <= 0) return toast.error(`You can attach up to ${MAX_TASK_COMPLETION_PHOTOS} photos`);
    try {
      const next = await Promise.all(Array.from(files).slice(0, remaining).map(compressImageFile));
      setPhotos((current) => [...current, ...next]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add photo");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
    }
  }

  async function removeTask(id: string) {
    setBusy(true);
    try {
      await archiveWorkspaceRecord(module.slug, id);
      setRecords((items) => items.filter((item) => item.id !== id));
      toast.success("Task deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete task");
    } finally {
      setBusy(false);
      setDeleteId(null);
    }
  }

  async function clearFinished() {
    setBusy(true);
    try {
      const result = await clearCompletedWorkspaceRecords(module.slug);
      const finishedIds = new Set(finished.map((item) => item.record.id));
      setRecords((items) => items.filter((item) => !finishedIds.has(item.id)));
      toast.success(result.count ? `Cleared ${result.count} finished task${result.count === 1 ? "" : "s"}` : "Finished list is already empty");
      setClearFinishedOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not clear finished tasks");
    } finally {
      setBusy(false);
    }
  }

  function TaskGroup({
    groups,
    mode,
  }: {
    groups: ReturnType<typeof groupByWorker>;
    mode: "open" | "finished";
  }) {
    return (
      <div className="space-y-6">
        {groups.named.map(({ employee, items }) => (
          <section key={employee.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <header className="flex items-center justify-between border-b border-teal-100 bg-teal-50 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">Task assignment for</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-950">{employee.name}</h2>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-sm text-teal-800">
                {items.length} {mode === "open" ? "open" : "finished"}
              </span>
            </header>
            <ul className="divide-y divide-slate-100">
              {items.map(({ record, data }) => (
                <li key={record.id} className="flex flex-col sm:flex-row sm:items-stretch">
                  <div className="flex min-w-0 flex-1 items-start gap-3 px-4 py-4">
                    <CheckCircle2 className={`mt-0.5 h-5 w-5 shrink-0 ${mode === "finished" ? "text-teal-600" : "text-slate-300"}`} />
                    <div className="min-w-0 flex-1">
                      <p className={`font-medium ${mode === "finished" ? "text-slate-500" : "text-slate-900"}`}>{record.title}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Due {data.dueAt ? format(new Date(data.dueAt), "EEE, MMM d · h:mm a") : "unset"}
                        {data.notes ? ` · ${data.notes}` : ""}
                      </p>
                      {data.checklist.length ? (
                        <ul className="mt-2 space-y-1 text-sm text-slate-600">
                          {data.checklist.map((item) => (
                            <li key={item} className="flex gap-2">
                              <span className={data.completion?.checkedItems.includes(item) ? "text-teal-700" : ""}>
                                {data.completion?.checkedItems.includes(item) ? "✓" : "•"} {item}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {mode === "finished" && data.completion ? (
                        <div className="mt-3 space-y-2">
                          <p className="text-xs text-teal-800">
                            Verified by {data.completion.completedByName}
                            {data.completion.note ? ` · ${data.completion.note}` : ""}
                          </p>
                          {data.completion.photos.length ? (
                            <div className="flex flex-wrap gap-2">
                              {data.completion.photos.map((photo) => (
                                <img
                                  key={photo.id}
                                  src={photo.dataUrl}
                                  alt={photo.name}
                                  className="h-16 w-16 rounded-lg object-cover"
                                />
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 border-t border-slate-100 px-4 py-3 sm:border-l sm:border-t-0">
                    {mode === "open" ? (
                      <Button type="button" size="sm" onClick={() => openComplete(record)}>
                        Complete
                      </Button>
                    ) : null}
                    <Button type="button" size="sm" variant="outline" onClick={() => openEditor(record)}>
                      Edit
                    </Button>
                    {canRemove ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Delete task"
                        onClick={() => setDeleteId(record.id)}
                      >
                        <Trash2 className="h-4 w-4 text-slate-500" />
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {groups.unassigned.length ? (
          <section className="rounded-2xl border border-dashed border-slate-300 p-5">
            <h2 className="font-semibold text-slate-800">Unassigned</h2>
            <ul className="mt-3 space-y-2">
              {groups.unassigned.map(({ record }) => (
                <li key={record.id}>
                  <button type="button" onClick={() => openEditor(record)} className="text-sm text-slate-700 underline">
                    {record.title}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    );
  }

  const completingData = completing ? readTask(completing) : null;

  return (
    <div className="space-y-5 pb-8">
      <OfficeAppHeader module={module}>
        <Button type="button" onClick={() => openEditor()} disabled={!permissions.canCreate}>
          <ListTodo className="h-4 w-4" />
          Assign a task
        </Button>
      </OfficeAppHeader>

      <Tabs value={tab} onValueChange={(value) => setTab(value as "open" | "finished")}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList>
            <TabsTrigger value="open">Open ({open.length})</TabsTrigger>
            <TabsTrigger value="finished">Finished ({finished.length})</TabsTrigger>
          </TabsList>
          {tab === "finished" && finished.length > 0 && canRemove ? (
            <Button type="button" variant="outline" onClick={() => setClearFinishedOpen(true)}>
              Clear finished
            </Button>
          ) : null}
        </div>

        <TabsContent value="open" className="mt-5">
          {!open.length ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
              <ListTodo className="mx-auto h-9 w-9 text-slate-300" />
              <h3 className="mt-3 font-semibold">No open task assignments</h3>
              <p className="mt-1 text-sm text-slate-500">Assign a task to a worker and they will get a notification.</p>
              <Button type="button" className="mt-4" onClick={() => openEditor()}>
                Assign a task
              </Button>
            </div>
          ) : (
            <TaskGroup groups={openGrouped} mode="open" />
          )}
        </TabsContent>

        <TabsContent value="finished" className="mt-5">
          {!finished.length ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
              <CheckCircle2 className="mx-auto h-9 w-9 text-slate-300" />
              <h3 className="mt-3 font-semibold">No finished tasks yet</h3>
              <p className="mt-1 text-sm text-slate-500">Completed work with photos and verification lands here.</p>
            </div>
          ) : (
            <TaskGroup groups={finishedGrouped} mode="finished" />
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={editing !== undefined} onOpenChange={(openState) => { if (!openState) setEditing(undefined); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <form onSubmit={submitAssignment}>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit task assignment" : "Assign a task"}</DialogTitle>
              <DialogDescription>The assigned worker gets an in-app notification and an email when email is set up.</DialogDescription>
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
                      {employee.name}{employee.id === currentEmployeeId ? " (you)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium">
                Due
                <Input required type="datetime-local" value={draft.dueAt} onChange={(e) => setDraft((current) => ({ ...current, dueAt: e.target.value }))} className="mt-1" />
              </label>
              <label className="text-sm font-medium">
                Work asked
                <Textarea value={draft.notes} onChange={(e) => setDraft((current) => ({ ...current, notes: e.target.value }))} className="mt-1" placeholder="Describe the work they need to finish" />
              </label>
              <div>
                <p className="text-sm font-medium">Checklist</p>
                <div className="mt-2 space-y-2">
                  {draft.checklist.map((item) => (
                    <div key={item} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                      <span className="flex-1">{item}</span>
                      <button
                        type="button"
                        className="text-slate-400 hover:text-red-600"
                        onClick={() => setDraft((current) => ({ ...current, checklist: current.checklist.filter((entry) => entry !== item) }))}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <Input
                    value={checklistDraft}
                    onChange={(e) => setChecklistDraft(e.target.value)}
                    placeholder="Add a work item"
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        const item = checklistDraft.trim();
                        if (!item) return;
                        setDraft((current) => ({ ...current, checklist: [...current.checklist, item] }));
                        setChecklistDraft("");
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const item = checklistDraft.trim();
                      if (!item) return;
                      setDraft((current) => ({ ...current, checklist: [...current.checklist, item] }));
                      setChecklistDraft("");
                    }}
                  >
                    Add
                  </Button>
                </div>
              </div>
              {draft.assignedToId ? (
                <p className="flex items-center gap-2 rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900">
                  <UserRound className="h-4 w-4" />
                  Task assignment for {employees.find((employee) => employee.id === draft.assignedToId)?.name}
                </p>
              ) : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(undefined)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save assignment"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(completing)} onOpenChange={(openState) => { if (!openState) setCompleting(null); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          {completing && completingData ? (
            <form onSubmit={submitCompletion}>
              <DialogHeader>
                <DialogTitle>Mark complete</DialogTitle>
                <DialogDescription>
                  Confirm the work for “{completing.title}”, then add a photo if you have one.
                </DialogDescription>
              </DialogHeader>
              <div className="my-5 grid gap-4">
                {completingData.notes ? (
                  <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{completingData.notes}</p>
                ) : null}
                {completingData.checklist.length ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Check off the work asked</p>
                    {completingData.checklist.map((item) => (
                      <label key={item} className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={checkedItems.includes(item)}
                          onChange={(event) =>
                            setCheckedItems((current) =>
                              event.target.checked ? [...current, item] : current.filter((entry) => entry !== item)
                            )
                          }
                        />
                        {item}
                      </label>
                    ))}
                  </div>
                ) : null}
                <label className="flex items-start gap-2 text-sm font-medium text-slate-800">
                  <input type="checkbox" className="mt-1" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                  I finished all the work asked for this task
                </label>
                <label className="text-sm font-medium">
                  Completion note
                  <Textarea value={completionNote} onChange={(e) => setCompletionNote(e.target.value)} className="mt-1" placeholder="Optional — what did you do?" />
                </label>
                <div>
                  <p className="text-sm font-medium">Photos</p>
                  <p className="mt-1 text-xs text-slate-500">Take a photo or upload one from the camera roll.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={() => cameraRef.current?.click()}>
                      <Camera className="h-4 w-4" />
                      Take photo
                    </Button>
                    <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
                      <ImagePlus className="h-4 w-4" />
                      Add photo
                    </Button>
                    <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void addPhotos(e.target.files)} />
                    <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void addPhotos(e.target.files)} />
                  </div>
                  {photos.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {photos.map((photo) => (
                        <div key={photo.id} className="relative">
                          <img src={photo.dataUrl} alt={photo.name} className="h-20 w-20 rounded-lg object-cover" />
                          <button
                            type="button"
                            className="absolute -right-1 -top-1 rounded-full bg-white p-1 shadow"
                            onClick={() => setPhotos((current) => current.filter((item) => item.id !== photo.id))}
                            aria-label="Remove photo"
                          >
                            <Trash2 className="h-3 w-3 text-slate-600" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCompleting(null)}>Cancel</Button>
                <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Submit and mark complete"}</Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteId)}
        onOpenChange={(openState) => { if (!openState) setDeleteId(null); }}
        title="Delete this task?"
        description="It will be removed from the assignment list."
        confirmLabel="Delete"
        variant="destructive"
        loading={busy}
        onConfirm={() => { if (deleteId) void removeTask(deleteId); }}
      />
      <ConfirmDialog
        open={clearFinishedOpen}
        onOpenChange={setClearFinishedOpen}
        title="Clear finished tasks?"
        description="This removes every completed task from the Finished tab so you can start fresh."
        confirmLabel="Clear finished"
        variant="destructive"
        loading={busy}
        onConfirm={() => void clearFinished()}
      />
    </div>
  );
}
