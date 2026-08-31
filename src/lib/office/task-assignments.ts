export const TASK_ASSIGNMENTS_WORKSPACE = "task-assignments";
export const TASK_ASSIGNMENTS_HREF = "/office/apps/task-assignments";
export const TASK_ASSIGNED_NOTIFICATION_TYPE = "TASK_ASSIGNED";
export const MAX_TASK_COMPLETION_PHOTOS = 4;

export type TaskPhoto = {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
};

export type TaskCompletion = {
  verified: boolean;
  note: string;
  completedAt: string;
  completedByName: string;
  photos: TaskPhoto[];
  checkedItems: string[];
};

export type TaskData = {
  kind: "task";
  notes: string;
  assignedToId: string | null;
  dueAt: string;
  done: boolean;
  checklist: string[];
  completion: TaskCompletion | null;
};

export function emptyTaskData(dueAt = ""): TaskData {
  return {
    kind: "task",
    notes: "",
    assignedToId: null,
    dueAt,
    done: false,
    checklist: [],
    completion: null,
  };
}

export function isFinishedTask(params: { status?: string | null; data: Pick<TaskData, "done"> }) {
  return params.data.done === true || params.status === "COMPLETE";
}

export function shouldNotifyTaskAssignee(params: {
  workspace: string;
  actorId: string;
  assigneeId: string | null | undefined;
  previousAssigneeId?: string | null;
  isCreate: boolean;
}) {
  if (params.workspace !== TASK_ASSIGNMENTS_WORKSPACE) return false;
  if (!params.assigneeId) return false;
  if (params.assigneeId === params.actorId) return false;
  if (params.isCreate) return true;
  return params.assigneeId !== (params.previousAssigneeId ?? null);
}

export function normalizeChecklist(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 20);
}

export function validateTaskCompletion(input: {
  confirmed: boolean;
  checklist: string[];
  checkedItems: string[];
}) {
  if (!input.confirmed) {
    return "Confirm that you finished all the work asked";
  }
  const missing = input.checklist.filter((item) => !input.checkedItems.includes(item));
  if (missing.length) {
    return "Check off every item you were asked to complete";
  }
  return null;
}

export function splitTaskRecords<T extends { status?: string | null; data: Pick<TaskData, "done"> }>(
  items: T[]
) {
  const open: T[] = [];
  const finished: T[] = [];
  for (const item of items) {
    if (isFinishedTask(item)) finished.push(item);
    else open.push(item);
  }
  return { open, finished };
}
