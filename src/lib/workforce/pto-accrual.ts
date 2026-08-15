import type { PayPeriodType, PtoAccrualPolicy } from "@prisma/client";

export function periodsPerYear(type: PayPeriodType): number {
  switch (type) {
    case "WEEKLY":
      return 52;
    case "BIWEEKLY":
      return 26;
    case "SEMIMONTHLY":
      return 24;
    case "MONTHLY":
      return 12;
  }
}

export function roundPtoHours(hours: number): number {
  return Math.round(hours * 100) / 100;
}

export function hoursForAccrualPeriod(
  policy: PtoAccrualPolicy,
  annualHours: number,
  payPeriodType: PayPeriodType
): number {
  const annual = Number(annualHours);
  if (!Number.isFinite(annual) || annual <= 0 || policy === "NONE") return 0;
  if (policy === "ANNUAL_GRANT") return roundPtoHours(annual);
  if (policy === "MONTHLY") return roundPtoHours(annual / 12);
  return roundPtoHours(annual / periodsPerYear(payPeriodType));
}

export function utcDateParts(date: Date) {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    day: date.getUTCDate(),
  };
}

function utcYmd(date: Date): string {
  const { year, month, day } = utcDateParts(date);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Anniversary grant year currently in effect as of `now` (UTC calendar date). */
export function currentAnnualGrantYear(now: Date, hireDate?: Date | null): number {
  const { year, month, day } = utcDateParts(now);
  if (!hireDate) return year;
  const hire = utcDateParts(hireDate);
  const anniversaryThisYear = Date.UTC(year, hire.month, hire.day);
  const nowUtc = Date.UTC(year, month, day);
  return nowUtc >= anniversaryThisYear ? year : year - 1;
}

export function accrualPeriodKey(args: {
  policy: PtoAccrualPolicy;
  now: Date;
  hireDate?: Date | null;
  payPeriodStart?: Date | null;
}): string | null {
  const { policy, now } = args;
  if (policy === "NONE") return null;
  if (policy === "ANNUAL_GRANT") {
    return `pto-accrual:year:${currentAnnualGrantYear(now, args.hireDate)}`;
  }
  if (policy === "MONTHLY") {
    const { year, month } = utcDateParts(now);
    return `pto-accrual:month:${year}-${String(month + 1).padStart(2, "0")}`;
  }
  if (!args.payPeriodStart) return null;
  return `pto-accrual:period:${utcYmd(args.payPeriodStart)}`;
}

export function carryoverPeriodKey(now: Date, hireDate?: Date | null): string {
  return `pto-carryover:year:${currentAnnualGrantYear(now, hireDate)}`;
}

export function carryoverHoursToForfeit(
  currentBalance: number,
  carryoverLimit: number | null | undefined
): number {
  if (carryoverLimit == null || !Number.isFinite(Number(carryoverLimit))) return 0;
  const excess = roundPtoHours(Number(currentBalance) - Number(carryoverLimit));
  return excess > 0 ? excess : 0;
}

export type AccrualPlan =
  | { action: "skip"; reason: string }
  | {
      action: "grant";
      periodKey: string;
      hours: number;
      carryoverForfeit: number;
      carryoverKey: string | null;
      reason: string;
    };

export function planEmployeeAccrual(input: {
  policy: PtoAccrualPolicy;
  annualHours: number;
  payPeriodType: PayPeriodType;
  now: Date;
  hireDate?: Date | null;
  startDate?: Date | null;
  createdAt: Date;
  currentBalance: number;
  carryoverLimit?: number | null;
  existingAccrualKeys: string[];
  payPeriodStart?: Date | null;
}): AccrualPlan {
  const policy = input.policy;
  if (policy === "NONE") return { action: "skip", reason: "policy_none" };

  const hours = hoursForAccrualPeriod(policy, input.annualHours, input.payPeriodType);
  if (hours <= 0) return { action: "skip", reason: "no_annual_hours" };

  const serviceDate = input.hireDate ?? input.startDate ?? null;
  const periodKey = accrualPeriodKey({
    policy,
    now: input.now,
    hireDate: serviceDate,
    payPeriodStart: input.payPeriodStart,
  });
  if (!periodKey) return { action: "skip", reason: "missing_period" };
  if (input.existingAccrualKeys.includes(periodKey)) {
    return { action: "skip", reason: "already_granted" };
  }

  const createdDuringCurrentPeriod =
    policy === "ANNUAL_GRANT"
      ? currentAnnualGrantYear(input.createdAt, serviceDate) ===
        currentAnnualGrantYear(input.now, serviceDate)
      : accrualPeriodKey({
          policy,
          now: input.createdAt,
          hireDate: serviceDate,
          payPeriodStart: input.payPeriodStart,
        }) === periodKey;

  if (createdDuringCurrentPeriod && input.existingAccrualKeys.length === 0) {
    return { action: "skip", reason: "opening_balance_covers_period" };
  }

  const carryoverForfeit =
    policy === "ANNUAL_GRANT"
      ? carryoverHoursToForfeit(input.currentBalance, input.carryoverLimit)
      : 0;

  return {
    action: "grant",
    periodKey,
    hours,
    carryoverForfeit,
    carryoverKey: carryoverForfeit > 0 ? carryoverPeriodKey(input.now, serviceDate) : null,
    reason: policy === "ANNUAL_GRANT" ? "annual_grant" : "recurring_accrual",
  };
}

export function openingPtoGrant(args: {
  policy: PtoAccrualPolicy;
  annualHours: number;
  payPeriodType: PayPeriodType;
  now?: Date;
  hireDate?: Date | null;
  payPeriodStart?: Date | null;
}) {
  const now = args.now ?? new Date();
  return {
    hours: hoursForAccrualPeriod(args.policy, args.annualHours, args.payPeriodType),
    periodKey: accrualPeriodKey({
      policy: args.policy,
      now,
      hireDate: args.hireDate,
      payPeriodStart: args.payPeriodStart,
    }),
  };
}
