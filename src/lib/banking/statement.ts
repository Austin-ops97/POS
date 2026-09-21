import { normalizeVendorName } from "@/lib/expenses/constants";

const DATE_HEADERS = new Set(["date", "posted", "post date", "transaction date", "trans date", "posted date"]);
const DESC_HEADERS = new Set(["description", "memo", "narrative", "details"]);
const MERCHANT_HEADERS = new Set(["merchant", "payee", "name"]);
const DEBIT_HEADERS = new Set(["debit", "withdrawal", "out", "amount debit", "debits"]);
const CREDIT_HEADERS = new Set(["credit", "deposit", "in", "amount credit", "credits"]);
const AMOUNT_HEADERS = new Set(["amount", "transaction amount"]);
const BALANCE_HEADERS = new Set(["balance", "running balance"]);

export type ParsedStatementRow = {
  postedOn: string;
  description: string;
  merchant: string | null;
  amount: number;
  balance: number | null;
  externalId: string;
};

export type StatementParseResult = {
  rows: ParsedStatementRow[];
  skippedDuplicates: number;
  invalidRows: number;
};

function headerIndex(headers: string[], aliases: Set<string>): number {
  return headers.findIndex((header) => aliases.has(header.trim().toLowerCase()));
}

export function parseMoney(value: string | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "-" || trimmed === "—") return null;
  const negative = /^\(.*\)$/.test(trimmed) || /-$/.test(trimmed) || trimmed.startsWith("-");
  const digits = trimmed.replace(/[,$()]/g, "").replace(/-$/, "").replace(/^-/, "");
  if (!digits || Number.isNaN(Number(digits))) return null;
  const amount = Math.round(Number(digits) * 100) / 100;
  return negative ? -amount : amount;
}

export function parseStatementDate(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(trimmed);
  if (!us) return null;
  const month = us[1].padStart(2, "0");
  const day = us[2].padStart(2, "0");
  const year = us[3].length === 2 ? `20${us[3]}` : us[3];
  return `${year}-${month}-${day}`;
}

export function statementExternalId(accountKey: string, postedOn: string, amountCents: number, description: string): string {
  return `stmt:${normalizeVendorName(accountKey)}:${postedOn}|${amountCents}|${normalizeVendorName(description)}`;
}

export function parseStatementTable(
  headers: string[],
  rows: string[][],
  accountKey: string,
  existingExternalIds: Set<string> = new Set(),
): StatementParseResult {
  const dateIdx = headerIndex(headers, DATE_HEADERS);
  const descIdx = headerIndex(headers, DESC_HEADERS);
  const merchantIdx = headerIndex(headers, MERCHANT_HEADERS);
  const debitIdx = headerIndex(headers, DEBIT_HEADERS);
  const creditIdx = headerIndex(headers, CREDIT_HEADERS);
  const amountIdx = headerIndex(headers, AMOUNT_HEADERS);
  const balanceIdx = headerIndex(headers, BALANCE_HEADERS);
  const descriptionIdx = descIdx >= 0 ? descIdx : merchantIdx;
  if (dateIdx < 0 || descriptionIdx < 0 || (amountIdx < 0 && debitIdx < 0 && creditIdx < 0)) {
    throw new Error("Invalid statement: include date, description, and amount or debit/credit columns");
  }

  const seen = new Set(existingExternalIds);
  const parsed: ParsedStatementRow[] = [];
  let skippedDuplicates = 0;
  let invalidRows = 0;

  for (const cells of rows) {
    const postedOn = parseStatementDate(cells[dateIdx]);
    const description = (cells[descriptionIdx] ?? "").trim();
    const merchant = merchantIdx >= 0 && merchantIdx !== descriptionIdx ? (cells[merchantIdx] ?? "").trim() || null : null;
    let amount: number | null = null;
    if (amountIdx >= 0) amount = parseMoney(cells[amountIdx]);
    if (amount == null && (debitIdx >= 0 || creditIdx >= 0)) {
      const debit = debitIdx >= 0 ? parseMoney(cells[debitIdx]) ?? 0 : 0;
      const credit = creditIdx >= 0 ? parseMoney(cells[creditIdx]) ?? 0 : 0;
      if (debit !== 0 || credit !== 0) amount = Math.round((credit - Math.abs(debit)) * 100) / 100;
    }
    if (!postedOn || !description || amount == null) {
      invalidRows += 1;
      continue;
    }
    const externalId = statementExternalId(accountKey, postedOn, Math.round(amount * 100), description);
    if (seen.has(externalId)) {
      skippedDuplicates += 1;
      continue;
    }
    seen.add(externalId);
    parsed.push({
      postedOn,
      description,
      merchant,
      amount,
      balance: balanceIdx >= 0 ? parseMoney(cells[balanceIdx]) : null,
      externalId,
    });
  }

  return { rows: parsed, skippedDuplicates, invalidRows };
}
