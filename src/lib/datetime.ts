import type { AuthContext } from "./auth";

/** Common IANA timezones for business display settings. */
export const COMMON_TIMEZONES: { value: string; label: string }[] = [
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "America/Phoenix", label: "Arizona (no DST)" },
  { value: "America/Anchorage", label: "Alaska Time" },
  { value: "Pacific/Honolulu", label: "Hawaii Time" },
  { value: "America/Puerto_Rico", label: "Atlantic Time (Puerto Rico)" },
  { value: "America/Toronto", label: "Eastern Time (Toronto)" },
  { value: "America/Vancouver", label: "Pacific Time (Vancouver)" },
  { value: "Europe/London", label: "GMT / London" },
  { value: "Europe/Paris", label: "Central European Time" },
  { value: "Asia/Tokyo", label: "Japan Standard Time" },
  { value: "Asia/Singapore", label: "Singapore Time" },
  { value: "Australia/Sydney", label: "Australian Eastern Time" },
  { value: "UTC", label: "UTC" },
];

export const DEFAULT_DISPLAY_TIMEZONE = "America/New_York";

export type FormatDateOptions = {
  timeZone?: string;
  dateOnly?: boolean;
};

/**
 * Format a date for display. When `timeZone` is provided, formats in that zone;
 * otherwise uses the browser/runtime local timezone.
 */
export function formatDate(
  date: Date | string,
  options?: FormatDateOptions
): string {
  return new Intl.DateTimeFormat("en-US", {
    ...(options?.dateOnly
      ? { dateStyle: "medium" }
      : { dateStyle: "medium", timeStyle: "short" }),
    timeZone: options?.timeZone,
  }).format(new Date(date));
}

/** Resolve the business display timezone from auth context. */
export function resolveDisplayTimezone(ctx: AuthContext): string {
  return ctx.displayTimezone;
}

/** Format a date using the business display timezone from auth context. */
export function formatDisplayDate(
  date: Date | string,
  ctx: AuthContext,
  options?: Omit<FormatDateOptions, "timeZone">
): string {
  return formatDate(date, { ...options, timeZone: ctx.displayTimezone });
}

/** Validate that a string is a recognized IANA timezone. */
export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Human-readable label for a timezone value. */
export function getTimezoneLabel(tz: string): string {
  const known = COMMON_TIMEZONES.find((t) => t.value === tz);
  if (known) return known.label;
  return tz.replace(/_/g, " ");
}
