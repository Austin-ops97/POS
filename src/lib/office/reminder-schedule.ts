/**
 * Pure recurrence helpers for project reminders.
 * All stored instants are UTC; calendar arithmetic respects the reminder timezone.
 */

export type ReminderRecurrenceKind = "ONE_TIME" | "DAILY" | "WEEKLY" | "MONTHLY";

export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/** Stable occurrence key used for delivery uniqueness (ISO UTC of the scheduled fire). */
export function occurrenceKey(at: Date): string {
  return at.toISOString();
}

export function getZonedParts(date: Date, timezone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** Convert a wall-clock date/time in `timezone` to a UTC Date. */
export function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timezone: string
): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const asInZone = getZonedParts(guess, timezone);
  const asUtc = Date.UTC(
    asInZone.year,
    asInZone.month - 1,
    asInZone.day,
    asInZone.hour,
    asInZone.minute,
    asInZone.second
  );
  const offset = asUtc - guess.getTime();
  return new Date(guess.getTime() - offset);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addCalendarDays(
  parts: ZonedParts,
  days: number
): Omit<ZonedParts, "hour" | "minute" | "second"> {
  const utc = Date.UTC(parts.year, parts.month - 1, parts.day + days);
  const d = new Date(utc);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

function addCalendarMonths(
  parts: ZonedParts,
  months: number
): Omit<ZonedParts, "hour" | "minute" | "second"> {
  const total = parts.month - 1 + months;
  const year = parts.year + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const dim = daysInMonth(year, month + 1);
  return { year, month: month + 1, day: Math.min(parts.day, dim) };
}

/**
 * Compute the next send instant after `from` (exclusive of `from` itself for recurring).
 * Returns null when the series has no further occurrence (ONE_TIME).
 */
export function computeNextSendAt(
  recurrence: ReminderRecurrenceKind,
  from: Date,
  intervalCount = 1,
  timezone = "America/Chicago"
): Date | null {
  const interval = Math.max(1, Math.floor(intervalCount) || 1);
  if (recurrence === "ONE_TIME") return null;

  const parts = getZonedParts(from, timezone);
  let nextCalendar: Omit<ZonedParts, "hour" | "minute" | "second">;

  switch (recurrence) {
    case "DAILY":
      nextCalendar = addCalendarDays(parts, interval);
      break;
    case "WEEKLY":
      nextCalendar = addCalendarDays(parts, interval * 7);
      break;
    case "MONTHLY":
      nextCalendar = addCalendarMonths(parts, interval);
      break;
    default:
      return null;
  }

  return zonedDateTimeToUtc(
    nextCalendar.year,
    nextCalendar.month,
    nextCalendar.day,
    parts.hour,
    parts.minute,
    parts.second,
    timezone
  );
}

/** Apply send-before offset to a scheduled instant. */
export function applySendBefore(scheduledAt: Date, sendBeforeMinutes: number): Date {
  const minutes = Math.max(0, Math.floor(sendBeforeMinutes) || 0);
  return new Date(scheduledAt.getTime() - minutes * 60_000);
}

/**
 * Advance from the current occurrence, returning the next fire time or null if complete.
 * Also respects stopAt / maxOccurrences when provided.
 */
export function advanceReminderSchedule(input: {
  recurrence: ReminderRecurrenceKind;
  occurrenceAt: Date;
  intervalCount: number;
  timezone: string;
  occurrenceCount: number;
  maxOccurrences?: number | null;
  stopAt?: Date | null;
}): Date | null {
  if (input.recurrence === "ONE_TIME") return null;
  const nextCount = input.occurrenceCount + 1;
  if (input.maxOccurrences != null && nextCount >= input.maxOccurrences) return null;

  const next = computeNextSendAt(
    input.recurrence,
    input.occurrenceAt,
    input.intervalCount,
    input.timezone
  );
  if (!next) return null;
  if (input.stopAt && next.getTime() > input.stopAt.getTime()) return null;
  return next;
}
