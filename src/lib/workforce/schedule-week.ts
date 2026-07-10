import { getWeekDays, getWeekStart } from "./pay-period";

export type WeekRange = {
  weekStart: Date;
  weekDays: Date[];
  fromIso: string;
  toIso: string;
};

function endOfWeekIso(weekStart: Date): string {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end.toISOString();
}

export function getWeekRange(weekStart: Date): WeekRange {
  const weekDays = getWeekDays(weekStart);
  return {
    weekStart,
    weekDays,
    fromIso: weekStart.toISOString(),
    toIso: endOfWeekIso(weekStart),
  };
}

export function getInitialWeekStart(weekStartDay: number, reference = new Date()): Date {
  return getWeekStart(reference, weekStartDay);
}

export function shiftWeekStart(weekStart: Date, deltaWeeks: number): Date {
  const next = new Date(weekStart);
  next.setDate(next.getDate() + deltaWeeks * 7);
  return next;
}
