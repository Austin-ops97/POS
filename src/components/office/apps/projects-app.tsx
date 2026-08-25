"use client";

import { FormEvent, useMemo, useState } from "react";
import { Archive, Check, Circle, FolderKanban, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { OfficeSuiteModule } from "@/lib/office/suite";
import type { OfficeWorkspaceRecordSummary } from "@/lib/office/workspace-service";
import { PROJECT_ARCHIVE_HELPER } from "@/lib/office/workspace-archive";
import { OfficeAppHeader } from "./app-header";
import {
  archiveWorkspaceRecord,
  createWorkspaceRecord,
  recordMetadata,
  restoreWorkspaceRecord,
  updateWorkspaceRecord,
  type EmployeeOption,
  type OfficeAppPermissions,
} from "./record-client";
import { ProjectRemindersPanel } from "./project-reminders-panel";
import { ProjectCompletionPanel } from "./project-completion-panel";

type TaskStatus = "TODO" | "DOING" | "DONE";
type ProjectTask = { id: string; title: string; status: TaskStatus; complete: boolean };
type ProjectData = { tasks: ProjectTask[]; color: string };
const empty: ProjectData = { tasks: [], color: "amber" };

export function ProjectsApp({
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
  const [view, setView] = useState<"active" | "archived">("active");
  const [activeId, setActiveId] = useState(initialRecords[0]?.id ?? "");
  const active = records.find((record) => record.id === activeId);
  const [data, setData] = useState<ProjectData>(recordMetadata(active, empty));
  const [adding, setAdding] = useState<TaskStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<OfficeWorkspaceRecordSummary | null>(null);
  const completion = data.tasks.length
    ? Math.round((data.tasks.filter((task) => task.complete).length / data.tasks.length) * 100)
    : 0;

  function load(record: OfficeWorkspaceRecordSummary) {
    setActiveId(record.id);
    setData(recordMetadata(record, empty));
  }

  async function newProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const saved = await createWorkspaceRecord(module.slug, {
        title: String(form.get("title")),
        summary: String(form.get("summary") || ""),
        dueAt: form.get("dueAt") ? new Date(String(form.get("dueAt"))).toISOString() : null,
        assignedToId: String(form.get("assignedToId") || "") || null,
        priority: String(form.get("priority") || "NORMAL"),
        metadata: empty,
      });
      setRecords((items) => [saved, ...items]);
      load(saved);
      setAdding(null);
      toast.success("Project created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create project");
    } finally {
      setBusy(false);
    }
  }

  async function save(next = data) {
    if (!active) return;
    setBusy(true);
    try {
      const locked = ["PENDING_APPROVAL", "CHANGES_REQUESTED", "REJECTED", "APPROVED"].includes(active.status);
      const saved = await updateWorkspaceRecord(module.slug, active.id, {
        status: locked
          ? active.status
          : next.tasks.length > 0 && next.tasks.every((task) => task.complete)
            ? "COMPLETE"
            : "ACTIVE",
        metadata: next,
      });
      setRecords((items) => items.map((item) => (item.id === saved.id ? saved : item)));
      toast.success("Project saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save project");
    } finally {
      setBusy(false);
    }
  }

  function moveTask(id: string, status: TaskStatus) {
    const next = {
      ...data,
      tasks: data.tasks.map((task) =>
        task.id === id ? { ...task, status, complete: status === "DONE" } : task
      ),
    };
    setData(next);
    void save(next);
  }

  function updateActiveStatus(status: string) {
    if (!active) return;
    setRecords((items) =>
      items.map((item) => (item.id === active.id ? { ...item, status } : item))
    );
  }

  async function loadView(nextView: "active" | "archived") {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/office/workspaces/${module.slug}/records?includeComplete=true${nextView === "archived" ? "&archived=true" : ""}`
      );
      if (!res.ok) throw new Error("Could not load projects");
      const next = (await res.json()) as OfficeWorkspaceRecordSummary[];
      setView(nextView);
      setRecords(next);
      if (next[0]) load(next[0]);
      else {
        setActiveId("");
        setData(empty);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load projects");
    } finally {
      setBusy(false);
    }
  }

  async function confirmArchive() {
    if (!archiveTarget) return;
    setBusy(true);
    try {
      await archiveWorkspaceRecord(module.slug, archiveTarget.id);
      const remaining = records.filter((record) => record.id !== archiveTarget.id);
      setRecords(remaining);
      if (activeId === archiveTarget.id) {
        if (remaining[0]) load(remaining[0]);
        else {
          setActiveId("");
          setData(empty);
        }
      }
      setArchiveTarget(null);
      toast.success("Project archived");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not archive project");
    } finally {
      setBusy(false);
    }
  }

  async function restoreProject(record: OfficeWorkspaceRecordSummary) {
    setBusy(true);
    try {
      const restored = await restoreWorkspaceRecord(module.slug, record.id);
      const remaining = records.filter((item) => item.id !== record.id);
      setRecords(remaining);
      if (activeId === record.id) {
        if (remaining[0]) load(remaining[0]);
        else {
          setActiveId("");
          setData(empty);
        }
      }
      toast.success(`${restored.title} restored to the active board`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not restore project");
    } finally {
      setBusy(false);
    }
  }

  const columns = useMemo(
    () => [
      { id: "TODO" as const, name: "To do", tone: "bg-slate-100" },
      { id: "DOING" as const, name: "In progress", tone: "bg-blue-50" },
      { id: "DONE" as const, name: "Done", tone: "bg-emerald-50" },
    ],
    []
  );

  return (
    <div className="space-y-5 pb-8">
      <OfficeAppHeader module={module}>
        <Button variant="outline" onClick={() => setAdding("TODO")} disabled={!active || !permissions.canEdit}>
          <Plus className="h-4 w-4" />
          Add task
        </Button>
        <Button
          onClick={() => (active ? save() : setAdding("DONE"))}
          disabled={busy || (active ? !permissions.canEdit : !permissions.canCreate)}
        >
          <Save className="h-4 w-4" />
          {active ? "Save project" : "New project"}
        </Button>
      </OfficeAppHeader>

      <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
        <aside className="rounded-2xl border border-slate-200 bg-slate-950 p-4 text-white">
          <Button
            className="w-full bg-amber-400 text-amber-950 hover:bg-amber-300"
            onClick={() => {
              setActiveId("");
              setAdding("DONE");
            }}
          >
            <Plus className="h-4 w-4" />
            New project
          </Button>
          <p className="mt-6 text-xs font-semibold uppercase tracking-wider text-slate-400">
            {view === "archived" ? "Archived" : "Projects"}
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{PROJECT_ARCHIVE_HELPER}</p>
          <Button
            type="button"
            variant="outline"
            className="mt-3 w-full border-white/20 bg-transparent text-white hover:bg-white/10"
            onClick={() => void loadView(view === "archived" ? "active" : "archived")}
            disabled={busy}
          >
            {view === "archived" ? "Show active" : "View archived"}
          </Button>
          <div className="mt-2 space-y-2">
            {records.map((record) => {
              const project = recordMetadata<ProjectData>(record, empty);
              const percent = project.tasks.length
                ? Math.round((project.tasks.filter((t) => t.complete).length / project.tasks.length) * 100)
                : 0;
              return (
                <button
                  key={record.id}
                  onClick={() => load(record)}
                  className={`w-full rounded-xl p-3 text-left ${
                    record.id === activeId ? "bg-white text-slate-950" : "bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <span className="block truncate text-sm font-semibold">{record.title}</span>
                  <span
                    className={`mt-2 block h-1.5 overflow-hidden rounded-full ${
                      record.id === activeId ? "bg-slate-200" : "bg-white/10"
                    }`}
                  >
                    <span className="block h-full bg-amber-400" style={{ width: `${percent}%` }} />
                  </span>
                  <span className="mt-1 block text-[11px] opacity-60">
                    {percent}% · {record.status.replaceAll("_", " ").toLowerCase()}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          {active ? (
            <>
              <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">Project board</p>
                  <h2 className="mt-1 text-2xl font-semibold">{active.title}</h2>
                  <p className="mt-1 text-sm text-slate-500">{active.summary}</p>
                  {view === "active" ? (
                    <p className="mt-2 text-xs text-slate-500">{PROJECT_ARCHIVE_HELPER}</p>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">This archived project keeps its tasks, reminders, and history.</p>
                  )}
                </div>
                <div className="flex flex-col items-stretch gap-3 sm:items-end">
                  {permissions.canDelete && view === "active" && ["COMPLETE", "APPROVED"].includes(active.status) ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setArchiveTarget(active)}
                      disabled={busy}
                    >
                      <Archive className="h-4 w-4" />
                      Archive project
                    </Button>
                  ) : null}
                  {permissions.canDelete && view === "archived" ? (
                    <Button type="button" variant="outline" onClick={() => void restoreProject(active)} disabled={busy}>
                      <RotateCcw className="h-4 w-4" />
                      Restore project
                    </Button>
                  ) : null}
                  <div className="flex justify-between text-xs">
                    <span>Progress</span>
                    <strong>{completion}%</strong>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-amber-500" style={{ width: `${completion}%` }} />
                  </div>
                </div>
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-3">
                {columns.map((column) => (
                  <section key={column.id} className={`min-h-96 rounded-xl p-3 ${column.tone}`}>
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">
                        {column.name}{" "}
                        <span className="ml-1 text-slate-400">
                          {data.tasks.filter((task) => task.status === column.id).length}
                        </span>
                      </h3>
                      <button
                        onClick={() => setAdding(column.id)}
                        className="rounded-lg p-1.5 hover:bg-white"
                        aria-label={`Add ${column.name} task`}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-3 space-y-2">
                      {data.tasks
                        .filter((task) => task.status === column.id)
                        .map((task) => (
                          <article key={task.id} className="rounded-xl border border-white/80 bg-white p-3 shadow-sm">
                            <div className="flex gap-2">
                              <button
                                onClick={() => moveTask(task.id, task.complete ? "TODO" : "DONE")}
                                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                                  task.complete
                                    ? "border-emerald-500 bg-emerald-500 text-white"
                                    : "border-slate-300"
                                }`}
                                aria-label={task.complete ? "Reopen task" : "Complete task"}
                              >
                                {task.complete ? <Check className="h-3 w-3" /> : <Circle className="h-3 w-3 opacity-0" />}
                              </button>
                              <span
                                className={`flex-1 text-sm ${
                                  task.complete ? "text-slate-400 line-through" : "text-slate-800"
                                }`}
                              >
                                {task.title}
                              </span>
                              <button
                                onClick={() => {
                                  const next = {
                                    ...data,
                                    tasks: data.tasks.filter((item) => item.id !== task.id),
                                  };
                                  setData(next);
                                  void save(next);
                                }}
                                className="text-slate-300 hover:text-red-500"
                                aria-label="Delete task"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            {column.id !== "TODO" ? (
                              <button
                                onClick={() => moveTask(task.id, column.id === "DONE" ? "DOING" : "TODO")}
                                className="mt-3 text-[11px] font-medium text-slate-500"
                              >
                                ← Move back
                              </button>
                            ) : null}
                            {column.id !== "DONE" ? (
                              <button
                                onClick={() => moveTask(task.id, column.id === "TODO" ? "DOING" : "DONE")}
                                className="mt-3 float-right text-[11px] font-medium text-blue-600"
                              >
                                Move forward →
                              </button>
                            ) : null}
                          </article>
                        ))}
                    </div>
                  </section>
                ))}
              </div>

              {view === "active" && permissions.canManageReminders ? (
                <ProjectRemindersPanel projectId={active.id} employees={employees} />
              ) : null}

              {view === "active" && (permissions.canSubmitCompletion || permissions.canApproveCompletion || permissions.canReopenProject) ? (
                <ProjectCompletionPanel
                  projectId={active.id}
                  projectStatus={active.status}
                  canSubmit={Boolean(permissions.canSubmitCompletion)}
                  canReopen={Boolean(permissions.canReopenProject)}
                  onStatusChange={updateActiveStatus}
                />
              ) : null}
            </>
          ) : (
            <div className="flex min-h-[500px] flex-col items-center justify-center text-center">
              <div className="rounded-2xl bg-amber-100 p-4 text-amber-700">
                <FolderKanban className="h-8 w-8" />
              </div>
              <h2 className="mt-4 text-xl font-semibold">Create a focused project</h2>
              <p className="mt-1 max-w-sm text-sm text-slate-500">
                Give it an owner and deadline, then move tasks across the board.
              </p>
              <Button className="mt-5" onClick={() => setAdding("DONE")}>
                New project
              </Button>
            </div>
          )}
        </main>
      </div>

      <Dialog
        open={adding !== null}
        onOpenChange={(open) => {
          if (!open) setAdding(null);
        }}
      >
        <DialogContent>
          {adding === "DONE" && !activeId ? (
            <form onSubmit={newProject}>
              <DialogHeader>
                <DialogTitle>New project</DialogTitle>
              </DialogHeader>
              <div className="my-5 grid gap-4">
                <label className="text-sm font-medium">
                  Project name
                  <Input name="title" required className="mt-1" />
                </label>
                <label className="text-sm font-medium">
                  Purpose
                  <Input name="summary" className="mt-1" />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm font-medium">
                    Due date
                    <Input name="dueAt" type="date" className="mt-1" />
                  </label>
                  <label className="text-sm font-medium">
                    Priority
                    <select name="priority" className="mt-1 h-10 w-full rounded-md border px-3">
                      <option>NORMAL</option>
                      <option>HIGH</option>
                      <option>URGENT</option>
                      <option>LOW</option>
                    </select>
                  </label>
                </div>
                <label className="text-sm font-medium">
                  Owner
                  <select name="assignedToId" className="mt-1 h-10 w-full rounded-md border px-3">
                    <option value="">Unassigned</option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={busy}>
                  Create project
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const title = String(new FormData(event.currentTarget).get("title") || "").trim();
                if (!title || !adding) return;
                const next = {
                  ...data,
                  tasks: [
                    ...data.tasks,
                    {
                      id: crypto.randomUUID(),
                      title,
                      status: adding,
                      complete: adding === "DONE",
                    },
                  ],
                };
                setData(next);
                setAdding(null);
                void save(next);
              }}
            >
              <DialogHeader>
                <DialogTitle>Add task</DialogTitle>
              </DialogHeader>
              <Input name="title" autoFocus required className="my-5" placeholder="What needs to be done?" />
              <DialogFooter>
                <Button type="submit">Add task</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null);
        }}
        title="Archive this project?"
        description="The project is hidden from the active board. Tasks, reminders, attachments, and history stay in the record and can be restored later."
        confirmLabel="Archive project"
        onConfirm={confirmArchive}
        loading={busy}
      />
    </div>
  );
}
