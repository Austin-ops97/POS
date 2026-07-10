/** Parse YYYY-MM-DD as a local calendar date (no UTC shift). */
export function parseDateOnly(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** Format a Date to YYYY-MM-DD using local calendar fields. */
export function formatDateOnly(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Build shift instants from a calendar date and HH:mm times in a location timezone.
 * Uses the environment's Intl API; stores UTC instants.
 */
export function buildShiftInstants(params: {
  date: string;
  startTime: string;
  endTime: string;
  timezone: string;
  overnight?: boolean;
}): { startAt: Date; endAt: Date; isOvernight: boolean } {
  const { date, startTime, endTime, timezone } = params;

  const startAt = zonedDateTimeToUtc(date, startTime, timezone);
  let endDate = date;
  let isOvernight = params.overnight ?? false;

  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (!isOvernight && endMinutes <= startMinutes) {
    isOvernight = true;
  }

  if (isOvernight) {
    const [y, m, d] = date.split("-").map(Number);
    const next = new Date(y, m - 1, d + 1);
    endDate = formatDateOnly(next);
  }

  const endAt = zonedDateTimeToUtc(endDate, endTime, timezone);
  return { startAt, endAt, isOvernight };
}

function zonedDateTimeToUtc(date: string, time: string, timezone: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));

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

  const parts = formatter.formatToParts(guess);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);

  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );

  const offset = asUtc - guess.getTime();
  return new Date(guess.getTime() - offset);
}

export function formatInTimezone(date: Date, timezone: string): string {
  return date.toLocaleString("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  });
}
