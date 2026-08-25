export const PROJECT_ARCHIVE_HELPER =
  "Completed projects stay in this list until you archive them. Archiving hides a project from the active board without deleting its tasks, reminders, or history.";

export type WorkspaceListView = "active" | "archived";

export function workspaceRecordListFilter(options: {
  archived?: boolean;
  includeComplete?: boolean;
}) {
  const archived = Boolean(options.archived);
  return {
    archivedAt: archived ? ({ not: null } as const) : null,
    ...(archived || options.includeComplete ? {} : { status: { not: "COMPLETE" as const } }),
  };
}

export function isArchivedRecord(archivedAt: string | Date | null | undefined): boolean {
  return archivedAt != null;
}

export function canArchiveWorkspaceRecord(params: {
  archivedAt: string | Date | null | undefined;
  canDelete: boolean;
}): boolean {
  return params.canDelete && !isArchivedRecord(params.archivedAt);
}

export function canRestoreWorkspaceRecord(params: {
  archivedAt: string | Date | null | undefined;
  canDelete: boolean;
}): boolean {
  return params.canDelete && isArchivedRecord(params.archivedAt);
}

export function splitWorkspaceRecords<T extends { archivedAt?: string | Date | null }>(
  records: T[],
  view: WorkspaceListView
): T[] {
  return records.filter((record) =>
    view === "archived" ? isArchivedRecord(record.archivedAt) : !isArchivedRecord(record.archivedAt)
  );
}
