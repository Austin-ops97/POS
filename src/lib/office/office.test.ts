import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { officeContentText, sanitizeOfficeContent } from "./content";
import {
  officeDocumentCreateSchema,
  officeDocumentUpdateSchema,
  officeFileOrderSchema,
  officeListQuerySchema,
} from "@/lib/validations/office";

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
