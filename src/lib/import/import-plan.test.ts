import assert from "node:assert/strict";
import { randomBytes } from "crypto";
import JSZip from "jszip";
import { describe, it } from "node:test";
import {
  detectEntity,
  emptyExistingIndex,
  errorReportCsv,
  importBatchWhere,
  parseTextTable,
  planImport,
  quickBooksWriteBlocked,
  rollbackTargets,
  suggestMapping,
} from "./import-plan";
import { parseXlsx } from "./parse-xlsx";
import {
  decryptSecret,
  encryptSecret,
  intuitConfig,
  quickBooksRows,
  signOAuthState,
  verifyOAuthState,
} from "../integrations/quickbooks";

describe("import parsing and mapping", () => {
  it("parses quoted csv and maps customer name to first and last name", () => {
    const table = parseTextTable('Customer Name,Email,Phone\n"Ada Lovelace",ada@example.com,555-0100\n', "people.csv");
    assert.equal(table.format, "CSV");
    const detected = detectEntity(table.headers, table.format);
    assert.equal(detected.entityType, "CUSTOMER");
    const mapping = suggestMapping("CUSTOMER", table.headers);
    assert.equal(mapping.firstName, "Customer Name");
    assert.equal(mapping.email, "Email");
    const plan = planImport({
      entityType: "CUSTOMER",
      headers: table.headers,
      rows: table.rows,
      mapping,
      existing: emptyExistingIndex(),
    });
    assert.equal(plan.rows[0]?.normalized.firstName, "Ada");
    assert.equal(plan.rows[0]?.normalized.lastName, "Lovelace");
    assert.equal(plan.rows[0]?.action, "VALID");
  });

  it("reads a QuickBooks IIF vendor export", () => {
    const table = parseTextTable("!VEND\tNAME\tPHONE\nVEND\tHome Depot\t555-0199\n", "vendors.iif");
    assert.equal(table.format, "IIF");
    assert.equal(detectEntity(table.headers, table.format, table.iifType).entityType, "VENDOR");
    const plan = planImport({
      entityType: "VENDOR",
      headers: table.headers,
      rows: table.rows,
      mapping: suggestMapping("VENDOR", table.headers),
      existing: emptyExistingIndex(),
    });
    assert.equal(plan.rows[0]?.normalized.name, "Home Depot");
    assert.equal(plan.counts.valid, 1);
  });

  it("reads the first worksheet of an xlsx file", async () => {
    const zip = new JSZip();
    zip.file("xl/sharedStrings.xml", `<?xml version="1.0"?><sst><si><t>Sku</t></si><si><t>Name</t></si><si><t>Price</t></si><si><t>Mug</t></si></sst>`);
    zip.file(
      "xl/worksheets/sheet1.xml",
      `<?xml version="1.0"?><worksheet><sheetData>
        <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>
        <row r="2"><c r="A2"><v>MUG-1</v></c><c r="B2" t="s"><v>3</v></c><c r="C2"><v>12.5</v></c></row>
      </sheetData></worksheet>`
    );
    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    const table = await parseXlsx(buffer);
    assert.deepEqual(table.headers, ["Sku", "Name", "Price"]);
    assert.equal(table.rows[0]?.[0], "MUG-1");
    assert.equal(table.rows[0]?.[2], "12.5");
  });
});

describe("duplicate protection and rollback", () => {
  it("updates a customer matched by email and skips a repeated row", () => {
    const existing = emptyExistingIndex();
    existing.customersByEmail["ada@example.com"] = "cust-1";
    const plan = planImport({
      entityType: "CUSTOMER",
      headers: ["Email", "First Name"],
      rows: [
        ["ada@example.com", "Ada"],
        ["ada@example.com", "Ada Again"],
        ["bea@example.com", "Bea"],
      ],
      mapping: { firstName: "First Name", lastName: null, email: "Email", phone: null, address: null, notes: null, externalId: null },
      existing,
    });
    assert.equal(plan.rows[0]?.action, "DUPLICATE");
    assert.equal(plan.rows[0]?.matchEntityId, "cust-1");
    assert.equal(plan.rows[1]?.action, "SKIPPED");
    assert.equal(plan.rows[2]?.action, "VALID");
  });

  it("matches products by sku and expenses by receipt without creating a second expense", () => {
    const existing = emptyExistingIndex();
    existing.productsBySku["mug-1"] = "prod-1";
    existing.expensesByReceipt["cafe|r-9"] = "exp-1";
    const products = planImport({
      entityType: "PRODUCT",
      headers: ["Sku", "Name", "Price"],
      rows: [["MUG-1", "Mug", "4.00"]],
      mapping: { name: "Name", sku: "Sku", barcode: null, price: "Price", cost: null, description: null, externalId: null },
      existing,
    });
    assert.equal(products.rows[0]?.action, "DUPLICATE");
    assert.equal(products.rows[0]?.matchReason, "sku");
    const expenses = planImport({
      entityType: "EXPENSE",
      headers: ["Merchant", "Total", "Date", "Receipt Number"],
      rows: [["Cafe", "8.00", "2026-09-01", "R-9"]],
      mapping: {
        merchant: "Merchant",
        amount: null,
        total: "Total",
        tax: null,
        tip: null,
        purchaseDate: "Date",
        receiptNumber: "Receipt Number",
        notes: null,
        paymentMethod: null,
        category: null,
        externalId: null,
      },
      existing,
    });
    assert.equal(expenses.rows[0]?.action, "SKIPPED");
    assert.equal(expenses.rows[0]?.matchEntityId, "exp-1");
  });

  it("does not commit an unsupported detected type", () => {
    const plan = planImport({
      entityType: "INVOICE",
      headers: ["Invoice Number"],
      rows: [["100"]],
      mapping: {},
      existing: emptyExistingIndex(),
    });
    assert.equal(plan.committable, false);
    assert.equal(plan.counts.skipped, 1);
  });

  it("scopes batch lookup to the business and plans rollback from created and updated rows", () => {
    const where = importBatchWhere("biz-a", "batch-1");
    assert.equal(where.businessId, "biz-a");
    assert.equal(where.id, "batch-1");
    const targets = rollbackTargets([
      { action: "CREATED", entityType: "CUSTOMER", entityId: "c1", previous: null },
      { action: "UPDATED", entityType: "PRODUCT", entityId: "p1", previous: { name: "Old" } },
      { action: "SKIPPED", entityType: "EXPENSE", entityId: "e1", previous: null },
    ]);
    assert.deepEqual(targets.created, [{ entityType: "CUSTOMER", entityId: "c1" }]);
    assert.equal(targets.updated[0]?.previous.name, "Old");
  });

  it("builds a downloadable error report", () => {
    const csv = errorReportCsv([
      { rowNumber: 2, action: "INVALID", message: 'Missing "name"' },
      { rowNumber: 3, action: "CREATED", message: null },
    ]);
    assert.match(csv, /2,INVALID,"Missing ""name"""/);
    assert.equal(csv.includes("CREATED"), false);
  });
});

describe("quickbooks scaffolding", () => {
  it("reports the exact missing Intuit variables", () => {
    const config = intuitConfig({} as NodeJS.ProcessEnv);
    assert.equal(config.ready, false);
    assert.deepEqual(config.missing, ["INTUIT_CLIENT_ID", "INTUIT_CLIENT_SECRET", "INTUIT_REDIRECT_URI", "INTUIT_TOKEN_ENCRYPTION_KEY"]);
  });

  it("encrypts tokens and rejects a tampered oauth state", () => {
    const key = randomBytes(32);
    const cipher = encryptSecret("secret-token", key);
    assert.equal(cipher.includes("secret-token"), false);
    assert.equal(decryptSecret(cipher, key), "secret-token");
    const state = signOAuthState({ businessId: "biz", employeeId: "emp" }, "state-secret");
    assert.equal(verifyOAuthState(state, "state-secret")?.businessId, "biz");
    assert.equal(verifyOAuthState(`${state}x`, "state-secret"), null);
    assert.match(quickBooksWriteBlocked("Invoice"), /not enabled/);
  });

  it("maps a QuickBooks customer without copying token fields", () => {
    const table = quickBooksRows("Customer", [{ Id: "42", DisplayName: "Ada Lovelace", PrimaryEmailAddr: { Address: "ada@example.com" }, access_token: "nope" }]);
    assert.deepEqual(table.headers, ["Display Name", "Email", "Phone", "Id"]);
    assert.equal(table.rows[0]?.[3], "42");
    assert.equal(JSON.stringify(table).includes("nope"), false);
  });
});
