import { getWeekStart } from "./pay-period";

export type OvertimeRules = {
  weekStartDay: number;
  weeklyThresholdHours: number;
  overtimeMultiplier: number;
  dailyOvertimeThresholdHours: number | null;
  doubleTimeDailyThresholdHours: number | null;
  doubleTimeMultiplier: number;
  exempt: boolean;
};

export type HourSlice = { at: Date; hours: number };

export type OvertimeResult = {
  regularHours: number;
  overtimeHours: number;
  doubleTimeHours: number;
  totalHours: number;
  regularPay: number;
  overtimePay: number;
  doubleTimePay: number;
  grossPay: number;
  rules: OvertimeRules;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function money(hours: number, rate: number, multiplier = 1): number {
  return Math.round(hours * rate * multiplier * 100) / 100;
}

function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Weekly overtime matches computeWeeklyOvertimeHours when daily and double-time
 * thresholds are empty. Daily overtime is taken first so those hours are not
 * counted again against the weekly threshold.
 */
export function computeOvertime(slices: HourSlice[], rules: OvertimeRules, hourlyRate: number): OvertimeResult {
  const byDay = new Map<string, { at: Date; hours: number }>();
  for (const slice of slices) {
    if (!Number.isFinite(slice.hours) || slice.hours <= 0) continue;
    const key = dayKey(slice.at);
    const current = byDay.get(key);
    if (current) current.hours += slice.hours;
    else byDay.set(key, { at: slice.at, hours: slice.hours });
  }

  const weeks = new Map<string, { straight: number; dailyOt: number; doubleTime: number }>();
  for (const day of byDay.values()) {
    let remaining = day.hours;
    let doubleTime = 0;
    if (
      !rules.exempt &&
      rules.doubleTimeDailyThresholdHours != null &&
      remaining > rules.doubleTimeDailyThresholdHours
    ) {
      doubleTime = remaining - rules.doubleTimeDailyThresholdHours;
      remaining = rules.doubleTimeDailyThresholdHours;
    }
    let dailyOt = 0;
    if (!rules.exempt && rules.dailyOvertimeThresholdHours != null && remaining > rules.dailyOvertimeThresholdHours) {
      dailyOt = remaining - rules.dailyOvertimeThresholdHours;
      remaining = rules.dailyOvertimeThresholdHours;
    }
    const week = getWeekStart(day.at, rules.weekStartDay).toISOString();
    const bucket = weeks.get(week) ?? { straight: 0, dailyOt: 0, doubleTime: 0 };
    bucket.straight += remaining;
    bucket.dailyOt += dailyOt;
    bucket.doubleTime += doubleTime;
    weeks.set(week, bucket);
  }

  let regularHours = 0;
  let overtimeHours = 0;
  let doubleTimeHours = 0;
  for (const week of weeks.values()) {
    if (rules.exempt) {
      regularHours += week.straight + week.dailyOt + week.doubleTime;
      continue;
    }
    const weeklyOt = Math.max(0, week.straight - rules.weeklyThresholdHours);
    regularHours += week.straight - weeklyOt;
    overtimeHours += week.dailyOt + weeklyOt;
    doubleTimeHours += week.doubleTime;
  }

  regularHours = round2(regularHours);
  overtimeHours = round2(overtimeHours);
  doubleTimeHours = round2(doubleTimeHours);
  const regularPay = money(regularHours, hourlyRate);
  const overtimePay = money(overtimeHours, hourlyRate, rules.exempt ? 1 : rules.overtimeMultiplier);
  const doubleTimePay = money(doubleTimeHours, hourlyRate, rules.exempt ? 1 : rules.doubleTimeMultiplier);
  return {
    regularHours,
    overtimeHours,
    doubleTimeHours,
    totalHours: round2(regularHours + overtimeHours + doubleTimeHours),
    regularPay,
    overtimePay,
    doubleTimePay,
    grossPay: round2(regularPay + overtimePay + doubleTimePay),
    rules,
  };
}
