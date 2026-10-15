import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { officeContentText, sanitizeOfficeContent } from "./content";
import {
  officeDocumentCreateSchema,
  officeDocumentUpdateSchema,
  officeFileOrderSchema,
  officeListQuerySchema,
} from "@/lib/validations/office";
import {
  officeWorkspaceRecordCreateSchema,
  officeWorkspaceRecordUpdateSchema,
} from "@/lib/validations/office-workspace";
import {
  CUSTOM_OFFICE_WORKSPACES,
  OFFICE_SUITE_GROUPS,
  OFFICE_SUITE_MODULES,
  getOfficeSuiteModule,
  officeModuleHref,
} from "./suite";
import { columnName, evaluateFormula, parseCsv, toCsv } from "./spreadsheet";
import { appointmentsConflict } from "./calendar";
import { convertUnit } from "./converters";
import { buildProjectRecordInput, normalizeProjectClientName, normalizeProjectSchedule } from "./project-create";
import { isProjectBlobConfigError, PROJECT_BLOB_SETUP_MESSAGE } from "@/lib/storage/blob-config";

describe("Office content security", () => {
  it("removes scripts, event handlers, external images, and unsafe links", () => {
    const clean = sanitizeOfficeContent(
      '<h1 onclick="alert(1)">Policy</h1><script>alert(1)</script><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">bad</a>'
    );
    assert.match(clean, /<h1>Policy<\/h1>/);
    assert.doesNotMatch(clean, /script|onclick|onerror|<img|javascript:/i);
  });

  it("preserves authenticated Office images and page structure only", () => {
    const clean = sanitizeOfficeContent(
      '<figure><img src="/api/office/files/clx123" alt="Site map"><figcaption>Site map</figcaption></figure><div class="office-page-break" data-office-page-break="true"><span>Page break</span></div><img src="https://tracker.example/pixel.png">'
    );
    assert.match(clean, /src="\/api\/office\/files\/clx123"/);
    assert.match(clean, /data-office-page-break="true"/);
    assert.doesNotMatch(clean, /tracker\.example/);
  });

  it("preserves safe word-processing styles", () => {
    const clean = sanitizeOfficeContent(
      '<p style="font-family: Georgia, serif; font-size: 18px; font-weight: bold; line-height: 1.5; text-align: justify">Formatted</p>'
    );
    assert.match(clean, /font-family:Georgia, serif/);
    assert.match(clean, /font-size:18px/);
    assert.match(clean, /font-weight:bold/);
    assert.match(clean, /line-height:1.5/);
    assert.match(clean, /text-align:justify/);
  });

  it("preserves supported business-document formatting", () => {
    const clean = sanitizeOfficeContent(
      '<h2>Checklist</h2><ol><li><strong>Open</strong> register</li></ol><table><tbody><tr><td colspan="2">Value</td></tr></tbody></table>'
    );
    assert.match(clean, /<h2>Checklist<\/h2>/);
    assert.match(clean, /<strong>Open<\/strong>/);
    assert.match(clean, /colspan="2"/);
  });

  it("preserves page layout, headers, footers, and page-number fields", () => {
    const clean = sanitizeOfficeContent(
      '<div class="office-document-layout" data-page-size="letter" data-orientation="portrait" data-margin-preset="custom" data-margin-top="0.75" data-margin-right="1" data-margin-bottom="0.75" data-margin-left="1"><div class="office-document-header"><p>Confidential</p></div><div class="office-document-body"><p>Report</p></div><div class="office-document-footer"><p class="office-page-number">Page </p></div></div>'
    );
    assert.match(clean, /class="office-document-layout"/);
    assert.match(clean, /data-margin-top="0.75"/);
    assert.match(clean, /class="office-document-header"/);
    assert.match(clean, /class="office-page-number"/);
  });

  it("extracts normalized search text", () => {
    assert.equal(officeContentText("<p>Hello&nbsp; <strong>world</strong></p>"), "Hello world");
  });
});

describe("Office validation", () => {
  it("defaults a new document safely", () => {
    const parsed = officeDocumentCreateSchema.parse({ title: "  SOP  " });
    assert.equal(parsed.title, "SOP");
    assert.equal(parsed.kind, "RICH_TEXT");
    assert.equal(parsed.isSensitive, false);
  });

  it("rejects empty updates", () => {
    assert.equal(officeDocumentUpdateSchema.safeParse({}).success, false);
  });

  it("bounds pagination and file ordering", () => {
    assert.equal(officeListQuerySchema.parse({ page: "2", pageSize: "50" }).page, 2);
    assert.equal(officeListQuerySchema.safeParse({ pageSize: "101" }).success, false);
    assert.equal(officeFileOrderSchema.safeParse({ fileIds: [] }).success, false);
  });
});

describe("Office & Admin suite", () => {
  it("publishes an accurate, uniquely-addressable tool directory", () => {
    assert.equal(OFFICE_SUITE_MODULES.length, 18);
    assert.equal(new Set(OFFICE_SUITE_MODULES.map((module) => module.slug)).size, 18);
    assert.deepEqual(
      new Set(OFFICE_SUITE_MODULES.map((module) => module.group)),
      new Set(OFFICE_SUITE_GROUPS)
    );
    for (const workspaceDefinition of OFFICE_SUITE_MODULES) {
      assert.ok(workspaceDefinition.features.length > 0, `${workspaceDefinition.slug} should list verified functions`);
      assert.ok(workspaceDefinition.features.length <= 3, `${workspaceDefinition.slug} should not overstate its scope`);
      assert.ok(workspaceDefinition.quickActions.length > 0, `${workspaceDefinition.slug} should have a direct action`);
      assert.match(officeModuleHref(workspaceDefinition), /^\//);
      if (workspaceDefinition.delivery === "connected") assert.ok(workspaceDefinition.nativeHref);
      if (workspaceDefinition.delivery === "built-in") assert.ok(CUSTOM_OFFICE_WORKSPACES.includes(workspaceDefinition.slug as never));
      assert.ok(getOfficeSuiteModule(workspaceDefinition.slug));
    }
  });

  it("normalizes safe defaults for shared workspace records", () => {
    const parsed = officeWorkspaceRecordCreateSchema.parse({ title: "  Monthly close  " });
    assert.equal(parsed.title, "Monthly close");
    assert.equal(parsed.status, "ACTIVE");
    assert.equal(parsed.priority, "NORMAL");
    assert.equal(officeWorkspaceRecordUpdateSchema.safeParse({}).success, false);
    assert.equal(
      officeWorkspaceRecordCreateSchema.safeParse({ title: "Review", priority: "CRITICAL" }).success,
      false
    );
    const form = officeWorkspaceRecordCreateSchema.parse({
      title: "New hire form",
      metadata: {
        kind: "form",
        description: "Collect details",
        fields: [{ id: "q1", label: "Name", type: "text", required: true, options: [] }],
      },
    });
    assert.equal((form.metadata as { kind: string }).kind, "form");
    assert.equal(((form.metadata as { fields: Array<{ label: string }> }).fields)[0].label, "Name");
  });
});

describe("Functional Office tools", () => {
  it("calculates formulas and round-trips quoted CSV", () => {
    const grid = [["10", "20"], ["5", "=A1+B1"], ["=SUM(A1:A2)", "=AVERAGE(A1:B1)"]];
    assert.equal(evaluateFormula(grid[1][1], grid), 30);
    assert.equal(evaluateFormula(grid[2][0], grid), 15);
    assert.equal(evaluateFormula(grid[2][1], grid), 15);
    assert.equal(columnName(26), "AA");
    assert.equal(evaluateFormula("=A1", [["=A1"]]), 0);
    const csv = toCsv([["Name", "Note"], ["Smith, Jane", 'Said "hello"']]);
    assert.deepEqual(parseCsv(csv), [["Name", "Note"], ["Smith, Jane", 'Said "hello"']]);
  });

  it("detects only overlapping appointments for the same assignee", () => {
    const existing = [
      { id: "one", assignedToId: "employee-a", startsAt: "2026-07-31T10:00:00Z", endsAt: "2026-07-31T11:00:00Z" },
      { id: "two", assignedToId: "employee-b", startsAt: "2026-07-31T10:00:00Z", endsAt: "2026-07-31T11:00:00Z" },
    ];
    assert.deepEqual(appointmentsConflict({ assignedToId: "employee-a", startsAt: "2026-07-31T10:30:00Z", endsAt: "2026-07-31T11:30:00Z" }, existing).map((item) => item.id), ["one"]);
    assert.equal(appointmentsConflict({ assignedToId: "employee-a", startsAt: "2026-07-31T11:00:00Z", endsAt: "2026-07-31T12:00:00Z" }, existing).length, 0);
  });

  it("builds a project with name, customer, dates, and description", () => {
    const built = buildProjectRecordInput({
      title: "  Patio install ",
      description: "Replace the back steps",
      customerId: "cust_1",
      clientName: "Should be ignored",
      startsAt: "2026-10-01",
      dueAt: "2026-10-15",
      priority: "HIGH",
      assignedToId: "",
    });
    assert.equal(built.ok, true);
    if (!built.ok) return;
    assert.equal(built.input.title, "Patio install");
    assert.equal(built.input.summary, "Replace the back steps");
    assert.equal(built.input.metadata.customerId, "cust_1");
    assert.equal(built.input.metadata.customerName, null);
    assert.equal(built.input.metadata.startsAt, "2026-10-01");
    assert.equal(built.input.dueAt, "2026-10-15T00:00:00.000Z");
    assert.equal(built.input.assignedToId, null);
    assert.deepEqual(built.input.metadata.tasks, []);
  });

  it("keeps an optional free-text client name when no directory customer is chosen", () => {
    const named = buildProjectRecordInput({
      title: "Walk-in",
      description: "",
      customerId: "",
      clientName: "  Jane   Doe  ",
      startsAt: "",
      dueAt: "",
      priority: "NORMAL",
      assignedToId: "",
    });
    assert.equal(named.ok, true);
    if (!named.ok) return;
    assert.equal(named.input.metadata.customerId, null);
    assert.equal(named.input.metadata.customerName, "Jane Doe");
    assert.equal(named.input.metadata.startsAt, null);
    assert.equal(named.input.dueAt, null);
    assert.equal(normalizeProjectClientName("   "), null);
    assert.equal(normalizeProjectClientName("x".repeat(140))?.length, 120);

    const missing = buildProjectRecordInput({
      title: "   ",
      description: "",
      customerId: "",
      clientName: "",
      startsAt: "",
      dueAt: "",
      priority: "NORMAL",
      assignedToId: "",
    });
    assert.equal(missing.ok, false);
  });

  it("rejects a due date before the start date", () => {
    const built = buildProjectRecordInput({
      title: "Late start",
      description: "",
      customerId: "",
      clientName: "",
      startsAt: "2026-11-02",
      dueAt: "2026-11-01",
      priority: "NORMAL",
      assignedToId: "",
    });
    assert.equal(built.ok, false);
    if (built.ok) return;
    assert.match(built.error, /due date can't be before the start date/);
    assert.equal(normalizeProjectSchedule("2026-10-01", new Date("2026-10-15T00:00:00.000Z")), "2026-10-01");
    assert.equal(normalizeProjectSchedule("2026-10-01", null), "2026-10-01");
    assert.throws(
      () => normalizeProjectSchedule("2026-11-02", new Date("2026-11-01T00:00:00.000Z")),
      /Invalid project dates: the due date can't be before the start date/
    );
    assert.equal(isProjectBlobConfigError(PROJECT_BLOB_SETUP_MESSAGE), true);
    assert.match(PROJECT_BLOB_SETUP_MESSAGE, /BLOB_READ_WRITE_TOKEN/);
  });

  it("converts business units and temperatures", () => {
    assert.ok(Math.abs(convertUnit(1, "length", "miles", "feet") - 5280) < 0.001);
    assert.ok(Math.abs(convertUnit(32, "temperature", "fahrenheit", "celsius")) < 0.001);
    assert.ok(Math.abs(convertUnit(1, "weight", "kilograms", "pounds") - 2.20462) < 0.001);
  });
});
