import type { PayPeriodType } from "@prisma/client";

export type PayPeriod = {
  start: Date;
  end: Date;
  label: string;
};

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function getWeekStart(date: Date, weekStartDay: number): Date {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = (day - weekStartDay + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

export function getCurrentPayPeriod(
  type: PayPeriodType,
  weekStartDay: number,
  referenceDate = new Date()
): PayPeriod {
  const ref = startOfDay(referenceDate);

  if (type === "WEEKLY") {
    const start = getWeekStart(ref, weekStartDay);
    const end = endOfDay(new Date(start));
    end.setDate(end.getDate() + 6);
    return { start, end, label: `${formatDate(start)} – ${formatDate(end)}` };
  }

  if (type === "BIWEEKLY") {
    const weekStart = getWeekStart(ref, weekStartDay);
    const epoch = getWeekStart(new Date(2024, 0, 1), weekStartDay);
    const weeksSince = Math.floor((weekStart.getTime() - epoch.getTime()) / (7 * 24 * 60 * 60 * 1000));
    const biweekOffset = weeksSince % 2 === 0 ? 0 : -7;
    const start = new Date(weekStart);
    start.setDate(start.getDate() + biweekOffset);
    const end = endOfDay(new Date(start));
    end.setDate(end.getDate() + 13);
    return { start, end, label: `${formatDate(start)} – ${formatDate(end)}` };
  }

  if (type === "SEMIMONTHLY") {
    const day = ref.getDate();
    if (day <= 15) {
      const start = new Date(ref.getFullYear(), ref.getMonth(), 1);
      const end = endOfDay(new Date(ref.getFullYear(), ref.getMonth(), 15));
      return { start, end, label: `${formatDate(start)} – ${formatDate(end)}` };
    }
    const start = new Date(ref.getFullYear(), ref.getMonth(), 16);
    const end = endOfDay(new Date(ref.getFullYear(), ref.getMonth() + 1, 0));
    return { start, end, label: `${formatDate(start)} – ${formatDate(end)}` };
  }

  const start = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const end = endOfDay(new Date(ref.getFullYear(), ref.getMonth() + 1, 0));
  return { start, end, label: `${formatDate(start)} – ${formatDate(end)}` };
}

export function getPayPeriods(
  type: PayPeriodType,
  weekStartDay: number,
  count: number,
  referenceDate = new Date()
): PayPeriod[] {
  const periods: PayPeriod[] = [];
  let cursor = new Date(referenceDate);

  for (let i = 0; i < count; i++) {
    const current = getCurrentPayPeriod(type, weekStartDay, cursor);
    periods.unshift(current);
    cursor = new Date(current.start);
    cursor.setDate(cursor.getDate() - 1);
  }

  return periods;
}

export function getWeekDays(weekStart: Date): Date[] {
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    days.push(startOfDay(d));
  }
  return days;
}
