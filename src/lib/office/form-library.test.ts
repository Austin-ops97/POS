import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { browseForms, getFormRecords } from "@/lib/office/form-library";
import type { OfficeWorkspaceRecordSummary } from "@/lib/office/workspace-service";

function formRecord(overrides: Partial<OfficeWorkspaceRecordSummary> & { id: string; title: string; metadata?: Record<string, unknown> }) {
  return {
    workspace: "forms-approvals",
    summary: null,
    status: "ACTIVE",
    priority: "NORMAL",
    dueAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    createdBy: { id: "u1", name: "User" },
    assignedTo: null,
    metadata: { kind: "form", description: "", fields: [] },
    ...overrides,
  } satisfies OfficeWorkspaceRecordSummary;
}

describe("Office form library", () => {
  it("filters out responses and folders", () => {
    const records = [
      formRecord({ id: "f1", title: "Intake", metadata: { kind: "form", description: "", fields: [] } }),
      formRecord({ id: "r1", title: "Response", metadata: { kind: "response", formId: "f1", formTitle: "Intake", answers: {} } }),
      formRecord({ id: "x1", title: "Folder", metadata: { kind: "folder" } }),
    ];
    assert.equal(getFormRecords(records).length, 1);
    assert.equal(getFormRecords(records)[0]?.id, "f1");
  });

  it("searches, filters, and sorts forms", () => {
    const forms = getFormRecords([
      formRecord({
        id: "a",
        title: "Beta",
        updatedAt: "2026-01-03T00:00:00.000Z",
        metadata: { kind: "form", description: "Second", fields: [], published: true },
      }),
      formRecord({
        id: "b",
        title: "Alpha",
        updatedAt: "2026-01-01T00:00:00.000Z",
        metadata: { kind: "form", description: "Draft form", fields: [], published: false },
      }),
    ]);
    const responseCounts = new Map([["a", 3], ["b", 1]]);

    assert.deepEqual(
      browseForms({ forms, query: "draft", filter: "all", sort: "name", responseCounts }).map((form) => form.id),
      ["b"]
    );
    assert.deepEqual(
      browseForms({ forms, query: "", filter: "published", sort: "updated", responseCounts }).map((form) => form.id),
      ["a"]
    );
    assert.deepEqual(
      browseForms({ forms, query: "", filter: "all", sort: "responses", responseCounts }).map((form) => form.id),
      ["a", "b"]
    );
  });
});
