import type { ExpenseFlagSeverity, ExpenseFlagType } from "@prisma/client";

export type FraudSignal = {
  type: ExpenseFlagType;
  severity: ExpenseFlagSeverity;
  message: string;
};

export type FraudContext = {
  total: number;
  purchaseDate: Date | string;
  categoryName?: string | null;
  allowedCategoryNames?: string[];
  largePurchaseThreshold: number;
  afterHoursStart: number;
  afterHoursEnd: number;
  weekendFlagsEnabled: boolean;
  missingReceipt: boolean;
  requireReceiptAbove: number;
  recentIdenticalCount?: number;
  looksLikeSplit?: boolean;
};

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * Policy / fraud signals are warnings only — never auto-reject.
 */
export function detectFraudSignals(ctx: FraudContext): FraudSignal[] {
  const signals: FraudSignal[] = [];
  const date = asDate(ctx.purchaseDate);
  const day = date.getUTCDay();
  const hour = date.getUTCHours();

  if (ctx.total >= ctx.largePurchaseThreshold) {
    signals.push({
      type: "LARGE_PURCHASE",
      severity: "HIGH",
      message: `Large purchase of ${ctx.total.toFixed(2)} exceeds threshold (${ctx.largePurchaseThreshold}).`,
    });
  }

  if (ctx.weekendFlagsEnabled && (day === 0 || day === 6)) {
    signals.push({
      type: "WEEKEND",
      severity: "INFO",
      message: "Purchase occurred on a weekend.",
    });
  }

  const afterHours =
    ctx.afterHoursStart > ctx.afterHoursEnd
      ? hour >= ctx.afterHoursStart || hour < ctx.afterHoursEnd
      : hour >= ctx.afterHoursStart && hour < ctx.afterHoursEnd;

  if (afterHours) {
    signals.push({
      type: "AFTER_HOURS",
      severity: "WARNING",
      message: "Purchase occurred outside normal business hours.",
    });
  }

  if (
    ctx.categoryName &&
    ctx.allowedCategoryNames &&
    ctx.allowedCategoryNames.length > 0 &&
    !ctx.allowedCategoryNames
      .map((n) => n.toLowerCase())
      .includes(ctx.categoryName.toLowerCase())
  ) {
    signals.push({
      type: "WRONG_CATEGORY",
      severity: "WARNING",
      message: `Category "${ctx.categoryName}" is not allowed for the selected card.`,
    });
  }

  if (ctx.looksLikeSplit) {
    signals.push({
      type: "SPLIT_TRANSACTION",
      severity: "WARNING",
      message: "This may be a split transaction (similar amount near the same day).",
    });
  }

  if ((ctx.recentIdenticalCount ?? 0) >= 2) {
    signals.push({
      type: "REPEATED_IDENTICAL",
      severity: "WARNING",
      message: "Repeated identical purchases detected recently.",
    });
  }

  if (ctx.missingReceipt && ctx.total >= ctx.requireReceiptAbove) {
    signals.push({
      type: "MISSING_RECEIPT",
      severity: "WARNING",
      message: "Receipt is missing for an amount that usually requires one.",
    });
  }

  if (
    ctx.categoryName &&
    /entertainment|meal/i.test(ctx.categoryName) &&
    ctx.total >= ctx.largePurchaseThreshold * 0.5
  ) {
    signals.push({
      type: "OUT_OF_POLICY",
      severity: "INFO",
      message: "High entertainment/meal spend — confirm policy compliance.",
    });
  }

  return signals;
}
