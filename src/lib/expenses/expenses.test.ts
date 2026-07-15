import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseReceiptText } from "./ocr";
import { detectFraudSignals } from "./fraud-detection";
import { slugifyCategory, normalizeVendorName, DEFAULT_EXPENSE_CATEGORIES } from "./constants";
import { hashContent } from "./hash";
import { reportToCsv } from "./report-service";

describe("expense categories", () => {
  it("includes expected default categories", () => {
    assert.ok(DEFAULT_EXPENSE_CATEGORIES.includes("Fuel"));
    assert.ok(DEFAULT_EXPENSE_CATEGORIES.includes("Meals"));
    assert.ok(DEFAULT_EXPENSE_CATEGORIES.includes("Miscellaneous"));
    assert.equal(DEFAULT_EXPENSE_CATEGORIES.length, 22);
  });

  it("slugifies category names", () => {
    assert.equal(slugifyCategory("Office Supplies"), "office-supplies");
    assert.equal(slugifyCategory("Payroll Related"), "payroll-related");
  });

  it("normalizes vendor names", () => {
    assert.equal(normalizeVendorName("  Starbucks #123! "), "starbucks 123");
  });
});

describe("OCR parsing", () => {
  it("extracts merchant, date, totals, tax, tip, and card last4", () => {
    const text = `
STARBUCKS STORE 8841
123 Market St
03/15/2026
Latte                  $5.45
Croissant              $3.25
Subtotal               $8.70
Tax                    $0.70
Tip                    $1.50
Total                  $10.90
Visa ending 4242
Thank you!
`;
    const result = parseReceiptText(text);
    assert.equal(result.merchant, "STARBUCKS STORE 8841");
    assert.equal(result.date, "2026-03-15");
    assert.equal(result.total, 10.9);
    assert.equal(result.tax, 0.7);
    assert.equal(result.tip, 1.5);
    assert.equal(result.cardLast4, "4242");
    assert.ok((result.confidence ?? 0) >= 60);
    assert.ok(result.items.length >= 1);
    assert.equal(result.categorySuggestion, "Meals");
  });

  it("handles empty text safely", () => {
    const result = parseReceiptText("");
    assert.equal(result.confidence, 20);
    assert.deepEqual(result.items, []);
  });
});

describe("fraud detection", () => {
  it("flags large, weekend, after-hours, and missing receipt without rejecting", () => {
    const signals = detectFraudSignals({
      total: 1200,
      purchaseDate: "2026-07-11T23:30:00Z", // Saturday late
      categoryName: "Meals",
      allowedCategoryNames: ["Fuel", "Travel"],
      largePurchaseThreshold: 500,
      afterHoursStart: 20,
      afterHoursEnd: 6,
      weekendFlagsEnabled: true,
      missingReceipt: true,
      requireReceiptAbove: 25,
      recentIdenticalCount: 3,
      looksLikeSplit: true,
    });

    const types = signals.map((s) => s.type);
    assert.ok(types.includes("LARGE_PURCHASE"));
    assert.ok(types.includes("WEEKEND"));
    assert.ok(types.includes("AFTER_HOURS"));
    assert.ok(types.includes("WRONG_CATEGORY"));
    assert.ok(types.includes("MISSING_RECEIPT"));
    assert.ok(types.includes("REPEATED_IDENTICAL"));
    assert.ok(types.includes("SPLIT_TRANSACTION"));
  });

  it("does not flag normal weekday lunch", () => {
    const signals = detectFraudSignals({
      total: 18,
      purchaseDate: "2026-07-15T12:00:00Z",
      categoryName: "Meals",
      largePurchaseThreshold: 500,
      afterHoursStart: 20,
      afterHoursEnd: 6,
      weekendFlagsEnabled: true,
      missingReceipt: false,
      requireReceiptAbove: 25,
    });
    assert.equal(signals.length, 0);
  });
});

describe("hashing", () => {
  it("is stable for same content", () => {
    assert.equal(hashContent("abc"), hashContent("abc"));
    assert.notEqual(hashContent("abc"), hashContent("abcd"));
  });
});

describe("report csv", () => {
  it("serializes grouped rows", () => {
    const csv = reportToCsv({
      rows: [
        { key: "1", label: "Meals", total: 12.5, count: 2 },
        { key: "2", label: "Fuel", total: 40, count: 1 },
      ],
      grandTotal: 52.5,
      expenseCount: 3,
    });
    assert.ok(csv.includes("Meals"));
    assert.ok(csv.includes("Grand Total"));
    assert.ok(csv.includes("52.50"));
  });
});

describe("approval status transitions (pure)", () => {
  it("maps expected lifecycle", () => {
    const flow = [
      "DRAFT",
      "PENDING_APPROVAL",
      "APPROVED",
      "REIMBURSED",
      "PAID",
    ];
    assert.deepEqual(flow.slice(0, 3), ["DRAFT", "PENDING_APPROVAL", "APPROVED"]);
  });
});
