/** Elapsed span (clock-in → clock-out or now) that triggers a forgot-to-clock-out / long-day flag. */
export const LONG_SHIFT_HOURS = 12;
export const LONG_SHIFT_MS = LONG_SHIFT_HOURS * 60 * 60 * 1000;

export type ShiftSpanInput = {
  clockIn: Date;
  clockOut?: Date | null;
  status?: string;
};

/** Elapsed wall-clock hours for a time entry (includes breaks). */
export function getShiftElapsedHours(
  entry: ShiftSpanInput,
  asOf: Date = new Date()
): number {
  const end = entry.clockOut ?? asOf;
  return Math.max(0, (end.getTime() - entry.clockIn.getTime()) / (1000 * 60 * 60));
}

/** True when the shift has run past the long-day threshold (likely missed clock-out, or a 12h+ day). */
export function isLongShift(
  entry: ShiftSpanInput,
  asOf: Date = new Date()
): boolean {
  return getShiftElapsedHours(entry, asOf) >= LONG_SHIFT_HOURS;
}

/** Human-readable flag label for payroll / timesheet UIs. */
export function longShiftFlagLabel(
  entry: ShiftSpanInput,
  asOf: Date = new Date()
): string | null {
  if (!isLongShift(entry, asOf)) return null;
  const hours = getShiftElapsedHours(entry, asOf);
  const rounded = Math.round(hours * 10) / 10;
  if (entry.status === "ACTIVE" || !entry.clockOut) {
    return `Forgot to clock out (>${LONG_SHIFT_HOURS}h, ${rounded}h open)`;
  }
  return `Long day (>${LONG_SHIFT_HOURS}h, ${rounded}h)`;
}

export function collectTimeEntryFlags(
  entry: ShiftSpanInput & { breaks?: Array<{ breakEnd?: Date | null }> },
  asOf: Date = new Date()
): string[] {
  const flags: string[] = [];
  if (entry.status === "ACTIVE" || !entry.clockOut) {
    flags.push("Missing clock-out");
  }
  const longFlag = longShiftFlagLabel(entry, asOf);
  if (longFlag) flags.push(longFlag);
  for (const br of entry.breaks ?? []) {
    if (!br.breakEnd) flags.push("Open break");
  }
  return flags;
}

export function validateTimesheetEditTimes(
  clockIn: Date,
  clockOut: Date | null
): string | null {
  if (clockOut && clockOut <= clockIn) {
    return "Clock out must be after clock in";
  }
  if (clockOut) {
    const hours = (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60);
    if (hours > 24) {
      return "Edited shift cannot exceed 24 hours";
    }
  }
  return null;
}
