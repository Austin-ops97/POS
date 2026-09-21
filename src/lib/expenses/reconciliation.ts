/** Money is compared in integer cents so itemized receipts do not drift. */

export function toCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

export function lineAmount(quantity: number, unitPrice: number): number {
  return fromCents(toCents(quantity * unitPrice));
}

export type ItemizedReconciliation = {
  lineSum: number;
  expectedTotal: number;
  receiptTotal: number;
  difference: number;
  matches: boolean;
};

export function reconcileItemizedExpense(input: {
  lines: Array<{ amount: number }>;
  tax: number;
  tip: number;
  receiptTotal: number;
}): ItemizedReconciliation {
  const lineSum = input.lines.reduce((sum, line) => sum + toCents(line.amount), 0);
  const expected = lineSum + toCents(input.tax) + toCents(input.tip);
  const receipt = toCents(input.receiptTotal);
  return {
    lineSum: fromCents(lineSum),
    expectedTotal: fromCents(expected),
    receiptTotal: fromCents(receipt),
    difference: fromCents(receipt - expected),
    matches: Math.abs(receipt - expected) <= 1,
  };
}

export function receiptDownloadName(input: {
  date: string;
  merchant: string;
  amount: number;
  extension: string;
  used: Set<string>;
}): string {
  const merchant =
    input.merchant
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 60) || "Receipt";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : "undated";
  const amount = toCents(input.amount) / 100;
  const extension = input.extension.replace(/^\./, "").toLowerCase() || "pdf";
  const base = `${date}_${merchant}_${amount.toFixed(2)}`;
  let name = `${base}.${extension}`;
  let suffix = 2;
  while (input.used.has(name.toLowerCase())) {
    name = `${base}-${suffix}.${extension}`;
    suffix += 1;
  }
  input.used.add(name.toLowerCase());
  return name;
}
