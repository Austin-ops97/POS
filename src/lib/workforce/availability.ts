export type AvailabilityWindow = {
  weekday: number;
  startMinute: number;
  endMinute: number;
};

export type AvailabilityException = {
  date: string;
  available: boolean;
  startMinute: number | null;
  endMinute: number | null;
};

export type TimeOffSpan = { startDate: string; endDate: string };

const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  let hour = Number(read("hour"));
  if (hour === 24) hour = 0;
  return {
    date: `${read("year")}-${read("month")}-${read("day")}`,
    weekday: WEEKDAY[read("weekday")] ?? 0,
    minute: hour * 60 + Number(read("minute")),
  };
}

function dateInSpan(date: string, span: TimeOffSpan): boolean {
  return date >= span.startDate && date <= span.endDate;
}

function windowsForDate(
  date: string,
  weekday: number,
  windows: AvailabilityWindow[],
  exceptions: AvailabilityException[]
): AvailabilityWindow[] | "closed" | "unconfigured-day" {
  const exception = exceptions.find((item) => item.date === date);
  if (exception) {
    if (!exception.available) return "closed";
    if (exception.startMinute == null || exception.endMinute == null) {
      return [{ weekday, startMinute: 0, endMinute: 24 * 60 }];
    }
    return [{ weekday, startMinute: exception.startMinute, endMinute: exception.endMinute }];
  }
  const day = windows.filter((window) => window.weekday === weekday);
  if (!day.length) return "unconfigured-day";
  return day;
}

export function shiftAvailabilityIssue(input: {
  startAt: Date;
  endAt: Date;
  timeZone: string;
  windows: AvailabilityWindow[];
  exceptions: AvailabilityException[];
  timeOff: TimeOffSpan[];
}): string | null {
  const start = zonedParts(input.startAt, input.timeZone);
  const end = zonedParts(input.endAt, input.timeZone);
  const endMinute = end.date === start.date ? end.minute : end.minute === 0 ? 24 * 60 : null;
  if (input.timeOff.some((span) => dateInSpan(start.date, span) || (end.date !== start.date && dateInSpan(end.date, span)))) {
    return "This shift conflicts with approved time off";
  }
  const configured = input.windows.length > 0 || input.exceptions.length > 0;
  if (!configured) return null;
  if (endMinute == null) return "This shift falls outside the employee's available hours";
  const windows = windowsForDate(start.date, start.weekday, input.windows, input.exceptions);
  if (windows === "closed" || windows === "unconfigured-day") {
    return "This shift falls on a day the employee is unavailable";
  }
  const fits = windows.some(
    (window) => start.minute >= window.startMinute && endMinute <= window.endMinute && window.endMinute > window.startMinute
  );
  if (!fits) return "This shift falls outside the employee's available hours";
  return null;
}
