export type CashTenderValidation = {
  valid: boolean;
  error?: string;
  changeDue: number;
};

export function parseTenderAmount(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100) / 100;
}

export function calculateChangeDue(total: number, amountTendered: number): number {
  return Math.max(0, Math.round((amountTendered - total) * 100) / 100);
}

export function validateCashTender(
  total: number,
  amountTendered: number
): CashTenderValidation {
  if (!Number.isFinite(amountTendered) || amountTendered < 0) {
    return { valid: false, error: "Enter a valid amount.", changeDue: 0 };
  }
  if (amountTendered < total) {
    return {
      valid: false,
      error: "Amount tendered must be at least the order total.",
      changeDue: 0,
    };
  }
  return {
    valid: true,
    changeDue: calculateChangeDue(total, amountTendered),
  };
}

/** Quick-cash suggestions for common tender amounts. */
export function getQuickCashAmounts(total: number): number[] {
  const amounts = new Set<number>();
  amounts.add(total);
  amounts.add(Math.ceil(total));
  for (const bill of [5, 10, 20, 50, 100]) {
    if (bill >= total) amounts.add(bill);
  }
  const nextFive = Math.ceil(total / 5) * 5;
  if (nextFive >= total) amounts.add(nextFive);
  const nextTen = Math.ceil(total / 10) * 10;
  if (nextTen >= total) amounts.add(nextTen);
  const nextTwenty = Math.ceil(total / 20) * 20;
  if (nextTwenty >= total) amounts.add(nextTwenty);
  return Array.from(amounts)
    .filter((n) => n >= total)
    .sort((a, b) => a - b)
    .slice(0, 6);
}
