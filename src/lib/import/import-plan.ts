export const IMPORT_ROW_LIMIT = 500;
export const IMPORT_BYTE_LIMIT = 1_500_000;

export const COMMIT_ENTITIES = ["CUSTOMER", "VENDOR", "PRODUCT", "EXPENSE"] as const;
export type CommitEntity = (typeof COMMIT_ENTITIES)[number];

export const DETECTED_ENTITIES = [
  ...COMMIT_ENTITIES,
  "INVOICE",
  "PAYMENT",
  "ACCOUNT",
  "EMPLOYEE",
  "INVENTORY",
  "TRANSACTION",
  "PROJECT",
] as const;

export type DetectedEntity = (typeof DETECTED_ENTITIES)[number];

export type ParsedTable = {
  format: "CSV" | "TSV" | "XLSX" | "IIF";
  headers: string[];
  rows: string[][];
  iifType?: string;
};

export type FieldMapping = Record<string, string | null>;

export type ExistingIndex = {
  customersByEmail: Record<string, string>;
  customersByPhone: Record<string, string>;
  vendorsByName: Record<string, string>;
  vendorsByPhone: Record<string, string>;
  productsBySku: Record<string, string>;
  productsByBarcode: Record<string, string>;
  expensesByReceipt: Record<string, string>;
  externalIds: Record<string, string>;
};

export type PlannedRow = {
  rowNumber: number;
  action: "VALID" | "INVALID" | "DUPLICATE" | "SKIPPED";
  errors: string[];
  warnings: string[];
  externalId: string | null;
  matchEntityId: string | null;
  matchReason: string | null;
  normalized: Record<string, string>;
};

export type ImportPlan = {
  entityType: string;
  committable: boolean;
  rows: PlannedRow[];
  counts: { valid: number; invalid: number; duplicate: number; skipped: number };
};

const FIELD_ALIASES: Record<CommitEntity, Record<string, string[]>> = {
  CUSTOMER: {
    firstName: ["first name", "firstname", "given name", "customer name", "customer", "name", "display name"],
    lastName: ["last name", "lastname", "surname", "family name"],
    email: ["email", "e-mail", "email address", "primary email"],
    phone: ["phone", "telephone", "mobile", "phone number", "primary phone"],
    address: ["address", "billing address", "street"],
    notes: ["notes", "note", "memo"],
    externalId: ["external id", "externalid", "customer id", "id", "qb id", "quickbooks id"],
  },
  VENDOR: {
    name: ["vendor", "vendor name", "supplier", "supplier name", "name", "display name"],
    phone: ["phone", "telephone", "phone number"],
    address: ["address", "street"],
    website: ["website", "url", "web"],
    notes: ["notes", "note", "memo"],
    externalId: ["external id", "vendor id", "id", "qb id"],
  },
  PRODUCT: {
    name: ["product", "product name", "item", "item name", "name", "service"],
    sku: ["sku", "item sku", "product sku"],
    barcode: ["barcode", "upc", "ean"],
    price: ["price", "sales price", "unit price", "rate"],
    cost: ["cost", "purchase cost", "unit cost"],
    description: ["description", "desc"],
    externalId: ["external id", "product id", "item id", "id", "qb id"],
  },
  EXPENSE: {
    merchant: ["merchant", "vendor", "payee", "name", "description"],
    amount: ["amount", "subtotal", "expense amount"],
    total: ["total", "total amount", "payment amount"],
    tax: ["tax", "sales tax"],
    tip: ["tip", "gratuity"],
    purchaseDate: ["date", "purchase date", "txn date", "transaction date"],
    receiptNumber: ["receipt", "receipt number", "ref no", "doc number", "num"],
    notes: ["notes", "memo", "private note"],
    paymentMethod: ["payment method", "payment", "paid by"],
    category: ["category", "account", "expense account"],
    externalId: ["external id", "transaction id", "txn id", "id", "qb id"],
  },
};

const REQUIRED: Record<CommitEntity, string[]> = {
  CUSTOMER: ["firstName"],
  VENDOR: ["name"],
  PRODUCT: ["name", "price"],
  EXPENSE: ["merchant", "purchaseDate"],
};

const FULL_NAME_HEADERS = new Set(["customer name", "customer", "name", "display name"]);

export function emptyExistingIndex(): ExistingIndex {
  return {
    customersByEmail: {},
    customersByPhone: {},
    vendorsByName: {},
    vendorsByPhone: {},
    productsBySku: {},
    productsByBarcode: {},
    expensesByReceipt: {},
    externalIds: {},
  };
}

export function importBatchWhere(businessId: string, id?: string) {
  return { businessId, ...(id ? { id } : {}) };
}

export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === delimiter) {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell.trim());
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }
  row.push(cell.trim());
  if (row.some((value) => value !== "")) rows.push(row);
  return rows;
}

export function tableFromRows(format: ParsedTable["format"], matrix: string[][]): ParsedTable {
  const [headerRow, ...body] = matrix;
  if (!headerRow || headerRow.every((cell) => cell === "")) {
    throw new Error("Invalid import: the file has no header row");
  }
  const headers = headerRow.map((header, index) => header || `Column ${index + 1}`);
  const rows = body
    .map((cells) => headers.map((_, index) => cells[index] ?? ""))
    .filter((cells) => cells.some((cell) => cell !== ""));
  if (rows.length > IMPORT_ROW_LIMIT) {
    throw new Error(`Invalid import: files are limited to ${IMPORT_ROW_LIMIT} rows`);
  }
  if (!rows.length) throw new Error("Invalid import: the file has no data rows");
  return { format, headers, rows };
}

export function parseTextTable(text: string, fileName: string): ParsedTable {
  if (text.length > IMPORT_BYTE_LIMIT) throw new Error("Invalid import: file is larger than 1.5 MB");
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  if (fileName.toLowerCase().endsWith(".iif") || trimmed.includes("\n!CUST") || trimmed.startsWith("!")) {
    return parseIif(trimmed);
  }
  const firstLine = trimmed.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = firstLine.split("\t").length > firstLine.split(",").length ? "\t" : ",";
  return tableFromRows(delimiter === "\t" ? "TSV" : "CSV", parseDelimited(trimmed, delimiter));
}

function parseIif(text: string): ParsedTable {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const headerLine = lines.find((line) => line.startsWith("!"));
  if (!headerLine) throw new Error("Invalid import: QuickBooks IIF file has no header");
  const headers = headerLine.slice(1).split("\t").map((header) => header.trim()).filter(Boolean);
  const prefix = headerLine.slice(1).split("\t")[0]?.trim();
  const rows = lines
    .filter((line) => !line.startsWith("!"))
    .map((line) => line.split("\t").map((cell) => cell.trim()))
    .filter((cells) => cells.some(Boolean) && (!prefix || cells[0] === prefix || cells.length >= 2))
    .map((cells) => {
      const values = cells[0] === prefix ? cells.slice(1) : cells;
      return headers.slice(1).map((_, index) => values[index] ?? values[index + (cells[0] === prefix ? 0 : 0)] ?? "");
    });
  const dataHeaders = headers.slice(1);
  const aligned = rows.map((cells) => dataHeaders.map((_, index) => cells[index] ?? ""));
  const table = tableFromRows("IIF", [dataHeaders.length ? dataHeaders : headers, ...aligned.filter((row) => row.some(Boolean))]);
  return { ...table, iifType: prefix };
}

export function detectEntity(headers: string[], format: ParsedTable["format"], iifType?: string): { entityType: DetectedEntity; scores: Record<string, number> } {
  const joined = headers.map((header) => header.toLowerCase());
  const scores: Record<string, number> = {};
  const signals: Record<DetectedEntity, string[]> = {
    CUSTOMER: ["customer", "email", "first name", "phone"],
    VENDOR: ["vendor", "supplier"],
    PRODUCT: ["sku", "barcode", "price", "item", "product"],
    EXPENSE: ["expense", "merchant", "receipt", "tax"],
    INVOICE: ["invoice", "due date", "invoice number"],
    PAYMENT: ["payment id", "amount paid"],
    ACCOUNT: ["account type", "account number", "account name"],
    EMPLOYEE: ["employee", "hire date", "job title"],
    INVENTORY: ["quantity on hand", "qty on hand", "reorder"],
    TRANSACTION: ["debit", "credit", "transaction"],
    PROJECT: ["project", "job name"],
  };
  if (format === "IIF") {
    const marker = (iifType ?? joined[0] ?? "").toLowerCase();
    if (marker.includes("cust")) scores.CUSTOMER = 5;
    if (marker.includes("vend")) scores.VENDOR = 5;
    if (marker.includes("invitem") || marker.includes("item")) scores.PRODUCT = 5;
    if (marker.includes("trns") || marker.includes("spl")) scores.EXPENSE = 5;
  }
  for (const [entity, words] of Object.entries(signals) as Array<[DetectedEntity, string[]]>) {
    for (const header of joined) {
      if (words.some((word) => header === word || header.includes(word))) scores[entity] = (scores[entity] ?? 0) + 1;
    }
  }
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const entityType = (ranked[0]?.[0] as DetectedEntity | undefined) ?? "CUSTOMER";
  return { entityType, scores };
}

export function isCommitEntity(value: string): value is CommitEntity {
  return (COMMIT_ENTITIES as readonly string[]).includes(value);
}

export function suggestMapping(entityType: CommitEntity, headers: string[]): FieldMapping {
  const mapping: FieldMapping = {};
  const used = new Set<string>();
  for (const [field, aliases] of Object.entries(FIELD_ALIASES[entityType])) {
    const match = headers.find((header) => {
      const key = header.trim().toLowerCase();
      return !used.has(header) && aliases.includes(key);
    });
    mapping[field] = match ?? null;
    if (match) used.add(match);
  }
  return mapping;
}

export function fieldsFor(entityType: CommitEntity): string[] {
  return Object.keys(FIELD_ALIASES[entityType]);
}

function cell(headers: string[], row: string[], header: string | null): string {
  if (!header) return "";
  const index = headers.indexOf(header);
  return index >= 0 ? (row[index] ?? "").trim() : "";
}

export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 ? digits : "";
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function parseMoney(value: string): string | null {
  const cleaned = value.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const negative = cleaned.startsWith("-");
  const [whole, fraction = ""] = cleaned.replace("-", "").split(".");
  const cents = `${fraction}00`.slice(0, 2);
  const text = `${whole}.${cents}`;
  return negative ? `-${text}` : text;
}

export function parseImportDate(value: string): string | null {
  const trimmed = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (!us) return null;
  const month = us[1].padStart(2, "0");
  const day = us[2].padStart(2, "0");
  return `${us[3]}-${month}-${day}`;
}

function splitPerson(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return { firstName: full.trim(), lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts.at(-1) ?? "" };
}

function readNormalized(entityType: CommitEntity, headers: string[], row: string[], mapping: FieldMapping): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of fieldsFor(entityType)) values[field] = cell(headers, row, mapping[field] ?? null);
  if (entityType === "CUSTOMER" && !values.lastName && values.firstName) {
    const source = (mapping.firstName ?? "").trim().toLowerCase();
    if (FULL_NAME_HEADERS.has(source)) {
      const split = splitPerson(values.firstName);
      values.firstName = split.firstName;
      values.lastName = split.lastName;
    }
  }
  return values;
}

export function externalKey(entityType: string, externalId: string): string {
  return `${entityType}:${externalId.trim()}`;
}

export function planImport(input: {
  entityType: string;
  headers: string[];
  rows: string[][];
  mapping: FieldMapping;
  existing: ExistingIndex;
}): ImportPlan {
  if (!isCommitEntity(input.entityType)) {
    return {
      entityType: input.entityType,
      committable: false,
      rows: [],
      counts: { valid: 0, invalid: 0, duplicate: 0, skipped: input.rows.length },
    };
  }
  const entityType = input.entityType;
  const seen = new Set<string>();
  const planned: PlannedRow[] = input.rows.map((row, index) => {
    const normalized = readNormalized(entityType, input.headers, row, input.mapping);
    const errors: string[] = [];
    const warnings: string[] = [];
    for (const field of REQUIRED[entityType]) {
      if (!normalized[field]) errors.push(`Missing ${field}`);
    }
    if (entityType === "EXPENSE" && !normalized.total && !normalized.amount) errors.push("Missing total");
    if (entityType === "PRODUCT" && normalized.price && !parseMoney(normalized.price)) errors.push("Invalid price");
    if (entityType === "EXPENSE" && normalized.purchaseDate && !parseImportDate(normalized.purchaseDate)) errors.push("Invalid purchase date");
    for (const moneyField of ["amount", "total", "tax", "tip", "cost"]) {
      if (normalized[moneyField] && !parseMoney(normalized[moneyField])) errors.push(`Invalid ${moneyField}`);
    }
    const externalId = normalized.externalId || null;
    let matchEntityId: string | null = null;
    let matchReason: string | null = null;
    const keys: string[] = [];
    if (externalId) keys.push(`external:${externalKey(entityType, externalId)}`);
    if (entityType === "CUSTOMER") {
      const email = normalizeEmail(normalized.email);
      const phone = normalizePhone(normalized.phone);
      if (email) keys.push(`email:${email}`);
      if (phone) keys.push(`phone:${phone}`);
      matchEntityId = (externalId && input.existing.externalIds[externalKey(entityType, externalId)]) || input.existing.customersByEmail[email] || input.existing.customersByPhone[phone] || null;
      if (matchEntityId) matchReason = externalId && input.existing.externalIds[externalKey(entityType, externalId)] ? "external id" : email && input.existing.customersByEmail[email] ? "email" : "phone";
    }
    if (entityType === "VENDOR") {
      const name = normalizeKey(normalized.name);
      const phone = normalizePhone(normalized.phone);
      if (name) keys.push(`vendor:${name}`);
      if (phone) keys.push(`phone:${phone}`);
      matchEntityId = (externalId && input.existing.externalIds[externalKey(entityType, externalId)]) || input.existing.vendorsByName[name] || input.existing.vendorsByPhone[phone] || null;
      if (matchEntityId) matchReason = "vendor";
    }
    if (entityType === "PRODUCT") {
      const sku = normalizeKey(normalized.sku);
      const barcode = normalized.barcode.trim();
      if (sku) keys.push(`sku:${sku}`);
      if (barcode) keys.push(`barcode:${barcode}`);
      matchEntityId = (externalId && input.existing.externalIds[externalKey(entityType, externalId)]) || input.existing.productsBySku[sku] || input.existing.productsByBarcode[barcode] || null;
      if (matchEntityId) matchReason = sku && input.existing.productsBySku[sku] ? "sku" : barcode && input.existing.productsByBarcode[barcode] ? "barcode" : "external id";
    }
    if (entityType === "EXPENSE") {
      const receipt = normalizeKey(normalized.receiptNumber);
      const merchant = normalizeKey(normalized.merchant);
      const receiptKey = receipt ? `${merchant}|${receipt}` : "";
      if (receiptKey) keys.push(`receipt:${receiptKey}`);
      matchEntityId = (externalId && input.existing.externalIds[externalKey(entityType, externalId)]) || (receiptKey ? input.existing.expensesByReceipt[receiptKey] : "") || null;
      if (matchEntityId) matchReason = "receipt or external id";
    }
    const duplicateInFile = keys.find((key) => seen.has(key));
    for (const key of keys) seen.add(key);
    if (errors.length) {
      return { rowNumber: index + 2, action: "INVALID" as const, errors, warnings, externalId, matchEntityId: null, matchReason: null, normalized };
    }
    if (duplicateInFile) {
      return { rowNumber: index + 2, action: "SKIPPED" as const, errors: [], warnings: [`Duplicate of an earlier row (${duplicateInFile})`], externalId, matchEntityId: null, matchReason: null, normalized };
    }
    if (matchEntityId && entityType === "EXPENSE") {
      return { rowNumber: index + 2, action: "SKIPPED" as const, errors: [], warnings: [`Matched existing expense by ${matchReason}`], externalId, matchEntityId, matchReason, normalized };
    }
    if (matchEntityId) {
      return { rowNumber: index + 2, action: "DUPLICATE" as const, errors: [], warnings: [`Will update the existing record matched by ${matchReason}`], externalId, matchEntityId, matchReason, normalized };
    }
    return { rowNumber: index + 2, action: "VALID" as const, errors, warnings, externalId, matchEntityId: null, matchReason: null, normalized };
  });
  return {
    entityType,
    committable: true,
    rows: planned,
    counts: {
      valid: planned.filter((row) => row.action === "VALID").length,
      invalid: planned.filter((row) => row.action === "INVALID").length,
      duplicate: planned.filter((row) => row.action === "DUPLICATE").length,
      skipped: planned.filter((row) => row.action === "SKIPPED").length,
    },
  };
}

export function errorReportCsv(rows: Array<{ rowNumber: number; action: string; message: string | null }>): string {
  const lines = ["row,action,message"];
  for (const row of rows) {
    if (!["INVALID", "FAILED", "SKIPPED"].includes(row.action)) continue;
    const message = (row.message ?? "").replace(/"/g, '""');
    lines.push(`${row.rowNumber},${row.action},"${message}"`);
  }
  return `${lines.join("\n")}\n`;
}

export function rollbackTargets(rows: Array<{ action: string; entityType: string; entityId: string | null; previous: Record<string, unknown> | null }>) {
  return {
    created: rows.filter((row) => row.action === "CREATED" && row.entityId).map((row) => ({ entityType: row.entityType, entityId: row.entityId as string })),
    updated: rows.filter((row) => row.action === "UPDATED" && row.entityId && row.previous).map((row) => ({
      entityType: row.entityType,
      entityId: row.entityId as string,
      previous: row.previous as Record<string, unknown>,
    })),
  };
}

export function quickBooksWriteBlocked(entity: string): string {
  return `Invalid QuickBooks sync: writing ${entity} back to QuickBooks is not enabled`;
}
