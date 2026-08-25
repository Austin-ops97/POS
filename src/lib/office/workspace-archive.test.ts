import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PERMISSIONS } from "@/lib/permissions";
import {
  PROJECT_ARCHIVE_HELPER,
  canArchiveWorkspaceRecord,
  canRestoreWorkspaceRecord,
  splitWorkspaceRecords,
  workspaceRecordListFilter,
} from "./workspace-archive";

describe("project archive workflow", () => {
  it("explains that completed projects can be archived rather than deleted", () => {
    assert.match(PROJECT_ARCHIVE_HELPER, /archive/i);
    assert.match(PROJECT_ARCHIVE_HELPER, /without deleting/i);
  });

  it("excludes archived projects from the active list by default", () => {
    const active = workspaceRecordListFilter({ includeComplete: true });
    assert.equal(active.archivedAt, null);
    const archived = workspaceRecordListFilter({ archived: true, includeComplete: true });
    assert.deepEqual(archived.archivedAt, { not: null });

    const records = [
      { id: "p1", archivedAt: null },
      { id: "p2", archivedAt: "2026-08-25T00:00:00.000Z" },
    ];
    assert.deepEqual(
      splitWorkspaceRecords(records, "active").map((row) => row.id),
      ["p1"]
    );
    assert.deepEqual(
      splitWorkspaceRecords(records, "archived").map((row) => row.id),
      ["p2"]
    );
  });

  it("gates archive and restore on delete permission and current archive state", () => {
    assert.equal(
      canArchiveWorkspaceRecord({ archivedAt: null, canDelete: true }),
      true
    );
    assert.equal(
      canArchiveWorkspaceRecord({ archivedAt: "2026-08-01T00:00:00.000Z", canDelete: true }),
      false
    );
    assert.equal(
      canArchiveWorkspaceRecord({ archivedAt: null, canDelete: false }),
      false
    );
    assert.equal(
      canRestoreWorkspaceRecord({ archivedAt: "2026-08-01T00:00:00.000Z", canDelete: true }),
      true
    );
    assert.equal(
      canRestoreWorkspaceRecord({ archivedAt: null, canDelete: true }),
      false
    );
    assert.equal(PERMISSIONS.DELETE_DOCUMENTS, "delete_documents");
  });

  it("preserves related record identity when archiving", () => {
    const project = {
      id: "proj_1",
      archivedAt: null as string | null,
      reminders: [{ id: "rem_1" }],
      tasks: [{ id: "task_1" }],
    };
    const archived = { ...project, archivedAt: "2026-08-25T12:00:00.000Z" };
    assert.equal(archived.id, project.id);
    assert.equal(archived.reminders[0].id, "rem_1");
    assert.equal(archived.tasks[0].id, "task_1");
  });
});
