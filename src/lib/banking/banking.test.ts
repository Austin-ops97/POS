import assert from "node:assert/strict";
import { randomBytes } from "crypto";
import { describe, it } from "node:test";
import { assertSplitsBalance, suggestCategory } from "./categorize";
import { bankTransactionWhere } from "./filters";
import { buildProfitAndLoss, reportRange } from "./pnl";
import { openAccessToken, plaidAmountToStored, plaidConfig, sealAccessToken } from "./plaid";
import { parseStatementTable } from "./statement";
import { buildTaxSummary, TAX_SUMMARY_DISCLAIMER } from "./tax-summary";

describe("bank categorization", () => {
  it("suggests Fuel for Shell and does not apply the keyword", () => {
    const suggestion = suggestCategory({
      merchant: "SHELL OIL",
      description: "fuel",
      rules: [],
      categoriesByName: { Fuel: "cat-fuel" },
    });
    assert.equal(suggestion.categoryName, "Fuel");
    assert.equal(suggestion.categoryId, "cat-fuel");
    assert.equal(suggestion.applied, false);
  });

  it("applies a saved Home Depot rule instead of the supplies keyword", () => {
    const suggestion = suggestCategory({
      merchant: "Home Depot",
      description: "lumber",
      rules: [{ pattern: "home depot", categoryId: "cat-supplies", categoryName: "Supplies" }],
      categoriesByName: { "Office Supplies": "cat-office" },
    });
    assert.equal(suggestion.categoryId, "cat-supplies");
    assert.equal(suggestion.applied, true);
  });

  it("rejects a split that does not add up", () => {
    assert.throws(() => assertSplitsBalance(-1000, [400, 500]), /Invalid split/);
    assert.doesNotThrow(() => assertSplitsBalance(-1000, [400, 600]));
  });
});

describe("profit and loss", () => {
  const today = "2026-09-21";

  it("builds month, quarter, year, and custom ranges", () => {
    assert.deepEqual(reportRange("this_month", today), { from: "2026-09-01", to: "2026-09-21" });
    assert.deepEqual(reportRange("last_month", today), { from: "2026-08-01", to: "2026-08-31" });
    assert.deepEqual(reportRange("quarter", today), { from: "2026-07-01", to: "2026-09-21" });
    assert.deepEqual(reportRange("year", today), { from: "2026-01-01", to: "2026-12-31" });
    assert.deepEqual(reportRange("ytd", today), { from: "2026-01-01", to: "2026-09-21" });
    assert.deepEqual(reportRange("custom", today, { from: "2026-01-02", to: "2026-01-05" }), { from: "2026-01-02", to: "2026-01-05" });
  });

  it("nets income minus expenses and skips personal or already-expensed bank rows", () => {
    const report = buildProfitAndLoss({
      orders: [{ id: "order-1", status: "PAID", totalCents: 10000, refundCents: 0 }],
      expenses: [{ id: "expense-1", categoryName: "Fuel", amountCents: 4000 }],
      bank: [
        { id: "bank-open", amountCents: -1000, personal: false, matchedExpenseId: null, categoryName: null },
        { id: "bank-personal", amountCents: -2000, personal: true, matchedExpenseId: null, categoryName: "Meals" },
        { id: "bank-matched", amountCents: -1500, personal: false, matchedExpenseId: "expense-1", categoryName: "Fuel" },
        { id: "bank-deposit", amountCents: 500, personal: false, matchedExpenseId: null, categoryName: null },
      ],
    });
    assert.equal(report.incomeCents, 10000);
    assert.equal(report.expenseCents, 5000);
    assert.equal(report.netCents, 5000);
    assert.equal(report.expenseLines.find((line) => line.label === "Uncategorized")?.cents, 1000);
    assert.equal(report.incomeLines.some((line) => line.label === "Other income"), false);
  });
});

describe("statement import", () => {
  it("skips a duplicate row in the same file and keeps accounts apart", () => {
    const headers = ["Date", "Description", "Debit", "Credit", "Balance"];
    const rows = [
      ["2026-09-01", "Shell", "40.00", "", "100.00"],
      ["2026-09-01", "Shell", "40.00", "", "60.00"],
      ["09/02/2026", "Deposit", "", "25.50", "85.50"],
    ];
    const first = parseStatementTable(headers, rows, "Checking");
    assert.equal(first.rows.length, 2);
    assert.equal(first.skippedDuplicates, 1);
    assert.equal(first.rows[0]?.amount, -40);
    assert.equal(first.rows[1]?.amount, 25.5);
    const otherAccount = parseStatementTable(headers, [rows[0]], "Savings");
    assert.notEqual(first.rows[0]?.externalId, otherAccount.rows[0]?.externalId);
    const again = parseStatementTable(headers, [rows[0]], "Checking", new Set([first.rows[0]!.externalId]));
    assert.equal(again.rows.length, 0);
    assert.equal(again.skippedDuplicates, 1);
  });
});

describe("tax summary and tenant scope", () => {
  it("labels unmapped categories without calling them deductible", () => {
    const rows = buildTaxSummary(
      [
        { id: "a", categoryId: "fuel", categoryName: "Fuel", amountCents: 1000, hasReceipt: true },
        { id: "b", categoryId: null, categoryName: null, amountCents: 200, hasReceipt: false },
      ],
      [{ categoryId: "fuel", taxLabel: "Vehicle" }],
    );
    assert.equal(rows[0]?.taxLabel, "Vehicle");
    assert.equal(rows[0]?.missingReceipts, 0);
    assert.equal(rows[1]?.category, "Uncategorized");
    assert.equal(rows[1]?.taxLabel, "Unmapped");
    assert.equal(rows[1]?.missingReceipts, 1);
    assert.equal(TAX_SUMMARY_DISCLAIMER.toLowerCase().includes("does not determine tax deductibility"), true);
    assert.equal(JSON.stringify(rows).toLowerCase().includes("deductible"), false);
  });

  it("always scopes bank transactions to the requested business", () => {
    const where = bankTransactionWhere("biz-a", { accountId: "acct-1" });
    assert.equal(where.businessId, "biz-a");
    assert.equal(where.accountId, "acct-1");
    assert.notEqual(bankTransactionWhere("biz-b").businessId, where.businessId);
  });
});

describe("plaid configuration", () => {
  it("lists the exact missing credentials and stays disconnected", () => {
    const config = plaidConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv);
    assert.deepEqual([...config.missing], ["PLAID_CLIENT_ID", "PLAID_SECRET", "PLAID_TOKEN_ENCRYPTION_KEY"]);
    assert.equal(config.ready, false);
    assert.equal(config.environment, "sandbox");
  });

  it("stores a Plaid outflow as a negative amount and round-trips the access token", () => {
    assert.equal(plaidAmountToStored(12.5), -12.5);
    const key = randomBytes(32);
    const sealed = sealAccessToken("access-sandbox-token", key);
    assert.notEqual(sealed, "access-sandbox-token");
    assert.equal(openAccessToken(sealed, key), "access-sandbox-token");
    const ready = plaidConfig({
      NODE_ENV: "test",
      PLAID_CLIENT_ID: "client",
      PLAID_SECRET: "secret",
      PLAID_TOKEN_ENCRYPTION_KEY: key.toString("base64"),
      PLAID_ENV: "sandbox",
    } as NodeJS.ProcessEnv);
    assert.equal(ready.ready, true);
    assert.deepEqual(ready.missing, []);
  });
});
