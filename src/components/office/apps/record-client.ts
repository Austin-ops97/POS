import type { OfficeWorkspaceRecordSummary } from "@/lib/office/workspace-service";

export type OfficeAppPermissions = {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canManageReminders?: boolean;
  canSubmitCompletion?: boolean;
  canApproveCompletion?: boolean;
  canReopenProject?: boolean;
};
export type EmployeeOption = { id: string; name: string };

async function apiError(response: Response) {
  const body = await response.json().catch(() => null);
  return body?.error ?? "The request could not be completed";
}

export async function createWorkspaceRecord(
  workspace: string,
  input: {
    title: string;
    summary?: string | null;
    status?: string;
    priority?: string;
    dueAt?: string | null;
    assignedToId?: string | null;
    metadata: Record<string, unknown>;
  },
) {
  const response = await fetch(`/api/office/workspaces/${workspace}/records`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "ACTIVE", priority: "NORMAL", ...input }),
  });
  if (!response.ok) throw new Error(await apiError(response));
  return response.json() as Promise<OfficeWorkspaceRecordSummary>;
}

export async function updateWorkspaceRecord(
  workspace: string,
  id: string,
  input: Partial<Pick<OfficeWorkspaceRecordSummary, "title" | "summary" | "status" | "priority" | "dueAt">> & {
    assignedToId?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  const response = await fetch(`/api/office/workspaces/${workspace}/records/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await apiError(response));
  return response.json() as Promise<OfficeWorkspaceRecordSummary>;
}

export async function archiveWorkspaceRecord(workspace: string, id: string) {
  const response = await fetch(`/api/office/workspaces/${workspace}/records/${id}`, { method: "DELETE" });
  if (!response.ok) throw new Error(await apiError(response));
}

export async function restoreWorkspaceRecord(workspace: string, id: string) {
  const response = await fetch(`/api/office/workspaces/${workspace}/records/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "restore" }),
  });
  if (!response.ok) throw new Error(await apiError(response));
  return response.json() as Promise<OfficeWorkspaceRecordSummary>;
}

export function recordMetadata<T>(record: OfficeWorkspaceRecordSummary | undefined, fallback: T): T {
  return record?.metadata ? { ...fallback, ...record.metadata } as T : fallback;
}

export function downloadText(name: string, content: string, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
