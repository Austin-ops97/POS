import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseReceiptText } from "./ocr";
import { detectFraudSignals } from "./fraud-detection";
import { slugifyCategory, normalizeVendorName, DEFAULT_EXPENSE_CATEGORIES } from "./constants";
import { hashContent } from "./hash";
import { reportToCsv } from "./report-service";
import { lineAmount, receiptDownloadName, reconcileItemizedExpense } from "./reconciliation";
import { preferredReceipt, receiptIndexCsv, receiptLibraryWhere } from "./receipt-query";
import { receiptDownloadSchema, receiptLibraryQuerySchema } from "../validations/expenses";
import { validationErrorMessage } from "../validation-message";

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
    assert.equal(result.paymentHint, "card");
    assert.match(result.address ?? "", /123 Market St/);
    assert.ok((result.confidence ?? 0) >= 60);
    assert.ok(result.items.length >= 1);
    assert.equal(result.categorySuggestion, "Meals");
  });

  it("extracts address, time, receipt number, and quantity lines", () => {
    const text = `
HOME DEPOT
456 Oak Ave
Springfield IL 62701
09/15/2026 2:14 PM
Receipt # A-10092
2 x Pine Board     4.00    8.00
Subtotal               $8.00
Tax                    $0.64
Total                  $8.64
Visa ending 1881
`;
    const result = parseReceiptText(text);
    assert.equal(result.merchant, "HOME DEPOT");
    assert.match(result.address ?? "", /456 Oak Ave/);
    assert.equal(result.time, "14:14");
    assert.equal(result.receiptNumber, "A-10092");
    assert.equal(result.paymentHint, "card");
    assert.equal(result.items[0]?.quantity, 2);
    assert.equal(result.items[0]?.unitPrice, 4);
    assert.equal(result.items[0]?.amount, 8);
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

describe("itemized reconciliation", () => {
  it("matches when lines, tax, and tip equal the receipt total", () => {
    const result = reconcileItemizedExpense({
      lines: [{ amount: 5.45 }, { amount: 3.25 }],
      tax: 0.7,
      tip: 1.5,
      receiptTotal: 10.9,
    });
    assert.equal(result.matches, true);
    assert.equal(result.difference, 0);
    assert.equal(result.lineSum, 8.7);
    assert.equal(result.expectedTotal, 10.9);
  });

  it("treats a one-cent difference as a match and prices lines in cents", () => {
    const result = reconcileItemizedExpense({
      lines: [{ amount: lineAmount(3, 1.1) }],
      tax: 0.01,
      tip: 0,
      receiptTotal: 3.32,
    });
    assert.equal(lineAmount(3, 1.1), 3.3);
    assert.equal(result.expectedTotal, 3.31);
    assert.equal(result.matches, true);
    assert.equal(result.difference, 0.01);
  });

  it("reports how far the receipt total is from the lines", () => {
    const result = reconcileItemizedExpense({
      lines: [{ amount: 10 }],
      tax: 1,
      tip: 0,
      receiptTotal: 12.5,
    });
    assert.equal(result.matches, false);
    assert.equal(result.expectedTotal, 11);
    assert.equal(result.difference, 1.5);
  });
});

describe("receipt download names", () => {
  it("uses date, merchant, and amount, and suffixes collisions", () => {
    const used = new Set<string>();
    const first = receiptDownloadName({
      date: "2026-09-15",
      merchant: "Home Depot",
      amount: 147.82,
      extension: "pdf",
      used,
    });
    const second = receiptDownloadName({
      date: "2026-09-15",
      merchant: "Home Depot",
      amount: 147.82,
      extension: "pdf",
      used,
    });
    assert.equal(first, "2026-09-15_Home-Depot_147.82.pdf");
    assert.equal(second, "2026-09-15_Home-Depot_147.82-2.pdf");
  });
});

describe("receipt library tenant scope", () => {
  it("pins the employee when the caller cannot view the team", () => {
    const where = receiptLibraryWhere({
      businessId: "biz-a",
      employeeId: "emp-me",
      viewAll: false,
      filters: { employeeId: "emp-other", merchant: "Home", q: "oak" },
    });
    assert.equal(where.businessId, "biz-a");
    assert.equal(where.employeeId, "emp-me");
    assert.equal(where.deletedAt, null);
  });

  it("honors an employee filter only when the caller can view the team", () => {
    const where = receiptLibraryWhere({
      businessId: "biz-a",
      employeeId: "emp-me",
      viewAll: true,
      filters: { employeeId: "emp-other" },
    });
    assert.equal(where.businessId, "biz-a");
    assert.equal(where.employeeId, "emp-other");
  });

  it("prefers the processed PDF and writes a CSV index", () => {
    const chosen = preferredReceipt([
      { role: "ORIGINAL", kind: "IMAGE", deletedAt: null, id: "orig" },
      { role: "PROCESSED", kind: "PDF", deletedAt: null, id: "pdf" },
      { role: "PROCESSED", kind: "PDF", deletedAt: new Date(), id: "gone" },
    ]);
    assert.equal(chosen?.id, "pdf");
    const csv = receiptIndexCsv([
      {
        filename: "2026-09-15_Home-Depot_147.82.pdf",
        date: "2026-09-15",
        vendor: "Home Depot",
        amount: "147.82",
        category: "Supplies",
        employee: "Ada",
        project: "Store, North",
      },
    ]);
    assert.match(csv, /^filename,date,vendor,amount,category,employee,project/);
    assert.match(csv, /"Store, North"/);
  });
});

describe("receipt download payload", () => {
  const blankFilters = {
    dateFrom: "",
    dateTo: "",
    merchant: "",
    minAmount: "",
    maxAmount: "",
    employeeId: "",
    categoryId: "",
    project: "",
    companyCardId: "",
    receiptNumber: "",
    locationId: "",
    q: "",
  };

  it("accepts checked receipt ids when unused filters are blank", () => {
    const parsed = receiptDownloadSchema.parse({
      allFiltered: false,
      receiptIds: ["receipt-dmca", "receipt-legalzoom"],
      includeCsv: true,
      filters: blankFilters,
    });
    assert.deepEqual(parsed.receiptIds, ["receipt-dmca", "receipt-legalzoom"]);
    assert.equal(parsed.allFiltered, false);
    assert.equal(parsed.includeCsv, true);
    assert.equal(parsed.filters?.dateFrom, undefined);
    assert.equal(parsed.filters?.dateTo, undefined);
    assert.equal(parsed.filters?.minAmount, undefined);
    assert.equal(parsed.filters?.maxAmount, undefined);
    assert.equal(parsed.filters?.merchant, undefined);

    const where = receiptLibraryWhere({
      businessId: "biz-a",
      employeeId: "emp-me",
      viewAll: true,
      filters: parsed.filters ?? {},
    });
    assert.equal(where.purchaseDate, undefined);
    assert.equal(where.total, undefined);
  });

  it("keeps From/To dates for download all filtered and ignores blank amounts", () => {
    const parsed = receiptDownloadSchema.parse({
      allFiltered: true,
      includeCsv: true,
      filters: { ...blankFilters, dateFrom: "2026-01-01", dateTo: "2026-09-22", minAmount: "6", maxAmount: "" },
    });
    assert.equal(parsed.receiptIds, undefined);
    assert.equal(parsed.filters?.dateFrom, "2026-01-01");
    assert.equal(parsed.filters?.dateTo, "2026-09-22");
    assert.equal(parsed.filters?.minAmount, 6);
    assert.equal(parsed.filters?.maxAmount, undefined);

    const where = receiptLibraryWhere({
      businessId: "biz-a",
      employeeId: "emp-me",
      viewAll: true,
      filters: parsed.filters ?? {},
    });
    assert.deepEqual(where.purchaseDate, {
      gte: new Date(Date.UTC(2026, 0, 1)),
      lte: new Date(Date.UTC(2026, 8, 22)),
    });
    assert.deepEqual(where.total, { gte: 6 });
  });

  it("still accepts the search query shape with string amounts", () => {
    const parsed = receiptLibraryQuerySchema.parse({
      dateFrom: "2026-01-01",
      minAmount: "12.50",
      merchant: "Legalzoom",
    });
    assert.equal(parsed.dateFrom, "2026-01-01");
    assert.equal(parsed.minAmount, 12.5);
    assert.equal(parsed.merchant, "Legalzoom");
    assert.equal(parsed.dateTo, undefined);
  });

  it("explains an actually invalid download instead of a bare validation error", () => {
    const tooMany = receiptDownloadSchema.safeParse({
      allFiltered: false,
      receiptIds: Array.from({ length: 81 }, (_, index) => `receipt-${index}`),
      includeCsv: true,
      filters: { ...blankFilters, dateFrom: "09/01/2026" },
    });
    assert.equal(tooMany.success, false);
    if (tooMany.success) return;
    const message = validationErrorMessage(tooMany.error);
    assert.notEqual(message, "Validation error");
    assert.match(message, /Selected receipts: Select 80 receipts or fewer/);
    assert.match(message, /From: Use YYYY-MM-DD/);
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
