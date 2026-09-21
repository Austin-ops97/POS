export type ReportPreset = "this_month" | "last_month" | "quarter" | "year" | "ytd" | "custom";

const PRESETS = new Set<ReportPreset>(["this_month", "last_month", "quarter", "year", "ytd", "custom"]);

export function isReportPreset(value: string | undefined): value is ReportPreset {
  return PRESETS.has(value as ReportPreset);
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function reportRange(
  preset: ReportPreset,
  todayIso: string,
  custom?: { from?: string; to?: string },
): { from: string; to: string } {
  const [year, month] = todayIso.split("-").map(Number);
  if (!year || !month) throw new Error("Invalid range: today is not a date");
  if (preset === "custom") {
    if (!custom?.from || !custom?.to) throw new Error("Invalid range: custom dates are required");
    if (custom.from > custom.to) throw new Error("Invalid range: start is after end");
    return { from: custom.from, to: custom.to };
  }
  if (preset === "this_month") return { from: iso(new Date(Date.UTC(year, month - 1, 1))), to: todayIso };
  if (preset === "last_month") {
    return {
      from: iso(new Date(Date.UTC(year, month - 2, 1))),
      to: iso(new Date(Date.UTC(year, month - 1, 0))),
    };
  }
  if (preset === "quarter") {
    const startMonth = Math.floor((month - 1) / 3) * 3;
    return { from: iso(new Date(Date.UTC(year, startMonth, 1))), to: todayIso };
  }
  if (preset === "year") return { from: `${year}-01-01`, to: `${year}-12-31` };
  return { from: `${year}-01-01`, to: todayIso };
}

export type PnlOrder = { id: string; status: string; totalCents: number; refundCents: number };
export type PnlExpense = { id: string; categoryName: string | null; amountCents: number };
export type PnlBank = {
  id: string;
  amountCents: number;
  personal: boolean;
  matchedExpenseId: string | null;
  categoryName: string | null;
};

export type PnlLine = { label: string; cents: number; ids: string[] };

export function buildProfitAndLoss(input: { orders: PnlOrder[]; expenses: PnlExpense[]; bank: PnlBank[] }): {
  incomeCents: number;
  expenseCents: number;
  netCents: number;
  incomeLines: PnlLine[];
  expenseLines: PnlLine[];
} {
  const income = new Map<string, { cents: number; ids: string[] }>();
  const expenses = new Map<string, { cents: number; ids: string[] }>();

  let sales = 0;
  const salesIds: string[] = [];
  for (const order of input.orders) {
    if (order.status !== "PAID" && order.status !== "PARTIALLY_REFUNDED") continue;
    const net = order.totalCents - order.refundCents;
    if (net <= 0) continue;
    sales += net;
    salesIds.push(order.id);
  }
  if (salesIds.length) income.set("Sales", { cents: sales, ids: salesIds });

  for (const expense of input.expenses) {
    add(expenses, expense.categoryName || "Uncategorized", expense.amountCents, expense.id);
  }

  for (const txn of input.bank) {
    if (txn.personal || txn.matchedExpenseId) continue;
    if (txn.amountCents < 0) {
      add(expenses, txn.categoryName || "Uncategorized", Math.abs(txn.amountCents), txn.id);
    } else if (txn.amountCents > 0 && txn.categoryName) {
      add(income, "Other income", txn.amountCents, txn.id);
    }
  }

  const incomeLines = lines(income);
  const expenseLines = lines(expenses);
  const incomeCents = incomeLines.reduce((sum, line) => sum + line.cents, 0);
  const expenseCents = expenseLines.reduce((sum, line) => sum + line.cents, 0);
  return { incomeCents, expenseCents, netCents: incomeCents - expenseCents, incomeLines, expenseLines };
}

function add(bucket: Map<string, { cents: number; ids: string[] }>, label: string, cents: number, id: string) {
  const row = bucket.get(label) ?? { cents: 0, ids: [] };
  row.cents += cents;
  if (row.ids.length < 200) row.ids.push(id);
  bucket.set(label, row);
}

function lines(bucket: Map<string, { cents: number; ids: string[] }>): PnlLine[] {
  return [...bucket.entries()].map(([label, row]) => ({ label, cents: row.cents, ids: row.ids }));
}
