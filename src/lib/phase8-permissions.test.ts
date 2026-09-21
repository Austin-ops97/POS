import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PERMISSIONS, ROLE_PERMISSIONS } from "./permissions";
import { canConnectQuickBooks, canOpenImport } from "./import/access";
import { bankListWindow, canConnectBank, canExportTaxSummary, canViewBankTransactions, canViewProfitAndLoss } from "./banking/access";
import { canManageSocial, canPublishSocial } from "./social/access";
import { publicErrorMessage, sanitizeAuditDetails } from "./audit-redaction";
import { bankTransactionWhere } from "./banking/filters";
import { socialPostWhere } from "./social/plan";
import { publishStatusMessage } from "./social/plan";
import { ocrReviewNote } from "./expenses/ocr";
import { expenseSearchOwnOnly, searchKindsFor } from "./search/scopes";
import type { AuthContext } from "./auth";

function ctx(role: keyof typeof ROLE_PERMISSIONS): AuthContext {
  return {
    employee: {
      role: {
        name: role,
        permissions: ROLE_PERMISSIONS[role].map((key) => ({ permission: { key } })),
      },
    },
  } as AuthContext;
}

const blocked = [
  PERMISSIONS.MANAGE_BANK,
  PERMISSIONS.MANAGE_SOCIAL,
  PERMISSIONS.PUBLISH_SOCIAL,
  PERMISSIONS.IMPORT_DATA,
  PERMISSIONS.VIEW_PAYROLL,
  PERMISSIONS.MANAGE_PAYROLL,
  PERMISSIONS.EXPORT_EXPENSES,
  PERMISSIONS.VIEW_EXPENSE_REPORTS,
  PERMISSIONS.MANAGE_COMPENSATION,
] as const;

describe("phase 8 permissions", () => {
  it("gives the owner every permission, including the new keys", () => {
    for (const key of Object.values(PERMISSIONS)) {
      assert.ok(ROLE_PERMISSIONS.Owner.includes(key), key);
    }
  });

  it("keeps cashiers and inventory staff off company financial, payroll, bank, social, and import access", () => {
    for (const role of ["Cashier", "Inventory Staff"] as const) {
      for (const key of blocked) {
        assert.equal(ROLE_PERMISSIONS[role].includes(key), false, `${role} ${key}`);
      }
      const actor = ctx(role);
      assert.equal(canOpenImport(actor), false);
      assert.equal(canConnectBank(actor), false);
      assert.equal(canConnectQuickBooks(actor), false);
      assert.equal(canManageSocial(actor), false);
      assert.equal(canPublishSocial(actor), false);
      assert.equal(canExportTaxSummary(actor), false);
      assert.equal(canViewBankTransactions(actor), false);
    }
  });

  it("lets finance move money data without social publishing or payroll processing", () => {
    const finance = ctx("Finance");
    assert.equal(canConnectBank(finance), true);
    assert.equal(canOpenImport(finance), true);
    assert.equal(canExportTaxSummary(finance), true);
    assert.equal(canPublishSocial(finance), false);
    assert.equal(canManageSocial(finance), false);
    assert.equal(ROLE_PERMISSIONS.Finance.includes(PERMISSIONS.MANAGE_PAYROLL), false);
    assert.equal(ROLE_PERMISSIONS.Finance.includes(PERMISSIONS.VIEW_PAYROLL), true);
  });

  it("lets managers publish social posts without bank or import access", () => {
    const manager = ctx("Manager");
    assert.equal(canPublishSocial(manager), true);
    assert.equal(canManageSocial(manager), true);
    assert.equal(canConnectBank(manager), false);
    assert.equal(canOpenImport(manager), false);
    assert.equal(ROLE_PERMISSIONS.Manager.includes(PERMISSIONS.MANAGE_PAYROLL), false);
  });

  it("lets a reports viewer see profit and loss without exporting it", () => {
    const viewer = ctx("Reports Viewer");
    assert.equal(canViewProfitAndLoss(viewer), true);
    assert.equal(canExportTaxSummary(viewer), false);
  });

  it("still lets the owner short-circuit even when the permission rows are empty", () => {
    const owner = { employee: { role: { name: "Owner", permissions: [] } } } as unknown as AuthContext;
    assert.equal(canConnectBank(owner), true);
    assert.equal(canPublishSocial(owner), true);
    assert.equal(canOpenImport(owner), true);
  });
});

describe("phase 8 audit and errors", () => {
  it("strips tokens, secrets, and full SSNs from audit details", () => {
    const cleaned = sanitizeAuditDetails({
      kind: "BANK_CONNECTED",
      accessToken: "secret-token",
      refresh_token: "another",
      notes: "ssn 123-45-6789 and Bearer abc.def",
      hourlyRate: 20,
      password: "hunter2",
    }) as Record<string, unknown>;
    assert.equal(cleaned.accessToken, "[redacted]");
    assert.equal(cleaned.refresh_token, "[redacted]");
    assert.equal(cleaned.password, "[redacted]");
    assert.equal(cleaned.hourlyRate, 20);
    assert.equal(cleaned.kind, "BANK_CONNECTED");
    assert.match(String(cleaned.notes), /\*\*\*-\*\*-\*\*\*\*/);
    assert.match(String(cleaned.notes), /Bearer \[redacted\]/);
    assert.doesNotMatch(String(cleaned.notes), /123-45-6789/);
  });

  it("hides stack traces from bank and social failures", () => {
    assert.equal(
      publicErrorMessage("Invalid Plaid: token=abc\n    at sync (node_modules/plaid)", "The bank could not be synced."),
      "The bank could not be synced."
    );
    assert.equal(publicErrorMessage("Invalid social: the connection request expired", "fallback"), "the connection request expired");
  });
});

describe("phase 8 search, pages, and user-facing states", () => {
  it("scopes bank and social rows to one business", () => {
    assert.equal(bankTransactionWhere("biz_a").businessId, "biz_a");
    assert.equal(socialPostWhere("biz_b").businessId, "biz_b");
    assert.notEqual(bankTransactionWhere("biz_a").businessId, socialPostWhere("biz_b").businessId);
  });

  it("does not search company transactions for a cashier, and limits their expenses to their own", () => {
    const keys = ROLE_PERMISSIONS.Cashier;
    const kinds = searchKindsFor(keys, false);
    assert.equal(kinds.includes("transaction"), false);
    assert.equal(kinds.includes("vendor"), false);
    assert.equal(kinds.includes("expense"), true);
    assert.equal(kinds.includes("receipt"), true);
    assert.equal(kinds.includes("customer"), true);
    assert.equal(kinds.includes("invoice"), true);
    assert.equal(expenseSearchOwnOnly(keys, false), true);
    assert.equal(expenseSearchOwnOnly(ROLE_PERMISSIONS.Finance, false), false);
  });

  it("pages bank transactions without an unbounded take", () => {
    assert.deepEqual(bankListWindow(undefined), { page: 1, skip: 0, take: 51 });
    assert.equal(bankListWindow(2).skip, 50);
    assert.equal(bankListWindow(500).page, 100);
  });

  it("explains uncertain OCR and partial social publish", () => {
    assert.match(ocrReviewNote(20) ?? "", /uncertain/);
    assert.equal(ocrReviewNote(90), null);
    assert.match(publishStatusMessage("PARTIAL"), /Retry/);
    assert.match(publishStatusMessage("FAILED"), /Nothing was published/);
  });
});
