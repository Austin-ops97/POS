import { shiftAvailabilityIssue, type AvailabilityException, type AvailabilityWindow, type TimeOffSpan } from "./availability";

export type SuggestionSlot = {
  id: string;
  startAt: Date;
  endAt: Date;
  locationId?: string | null;
  requiredRole?: string | null;
  projectTitle?: string | null;
  headcount: number;
};

export type SuggestionEmployee = {
  id: string;
  name: string;
  roleName: string;
  jobTitle?: string | null;
  hourlyRate: number;
  salaried: boolean;
  exempt: boolean;
  maxWeeklyHours?: number | null;
  preferredWeeklyHours?: number | null;
  weeklyThresholdHours: number;
  overtimeMultiplier: number;
  windows: AvailabilityWindow[];
  exceptions: AvailabilityException[];
  timeOff: TimeOffSpan[];
  existingShifts: Array<{ startAt: Date; endAt: Date }>;
  projectTitles: string[];
  weekHours: number;
};

export type ScheduleWarning = {
  code:
    | "UNAVAILABLE"
    | "PTO"
    | "OVERTIME"
    | "UNDERSTAFFED"
    | "DOUBLE_BOOKED"
    | "QUALIFICATION"
    | "MAX_HOURS"
    | "PREFERRED_HOURS"
    | "LABOR_COST";
  message: string;
};

export type ScheduleAssignment = {
  slotId: string;
  employeeId: string;
  employeeName: string;
  locationId: string | null;
  startAt: string;
  endAt: string;
  estimatedCost: number;
  warnings: ScheduleWarning[];
};

export type ScheduleSuggestion = {
  assignments: ScheduleAssignment[];
  unfilled: Array<{ slotId: string; missing: number }>;
  warnings: ScheduleWarning[];
  estimatedLaborCost: number;
  laborCostAlert: boolean;
};

function hoursBetween(start: Date, end: Date): number {
  return Math.max(0, (end.getTime() - start.getTime()) / 3_600_000);
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

function roleMatches(employee: SuggestionEmployee, required?: string | null): boolean {
  if (!required?.trim()) return true;
  const needle = required.trim().toLowerCase();
  return employee.roleName.toLowerCase().includes(needle) || (employee.jobTitle ?? "").toLowerCase().includes(needle);
}

function shiftCost(employee: SuggestionEmployee, hours: number, weekHours: number): { cost: number; overtime: boolean } {
  if (employee.salaried || employee.hourlyRate <= 0) return { cost: 0, overtime: false };
  if (employee.exempt) return { cost: Math.round(hours * employee.hourlyRate * 100) / 100, overtime: false };
  const before = Math.min(weekHours, employee.weeklyThresholdHours);
  const after = weekHours + hours;
  const regular = Math.max(0, Math.min(after, employee.weeklyThresholdHours) - before);
  const overtime = Math.max(0, after - employee.weeklyThresholdHours);
  const cost = regular * employee.hourlyRate + overtime * employee.hourlyRate * employee.overtimeMultiplier;
  return { cost: Math.round(cost * 100) / 100, overtime: overtime > 0 };
}

export function suggestSchedule(input: {
  slots: SuggestionSlot[];
  employees: SuggestionEmployee[];
  timeZone: string;
  laborCostAlertAmount?: number | null;
}): ScheduleSuggestion {
  const planned = new Map<string, Array<{ startAt: Date; endAt: Date }>>();
  const weekHours = new Map(input.employees.map((employee) => [employee.id, employee.weekHours]));
  const assignments: ScheduleAssignment[] = [];
  const unfilled: Array<{ slotId: string; missing: number }> = [];
  const warnings: ScheduleWarning[] = [];

  const slots = [...input.slots].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  for (const slot of slots) {
    const hours = hoursBetween(slot.startAt, slot.endAt);
    let missing = slot.headcount;
    const blocked = new Set<string>();
    while (missing > 0) {
      const ranked = input.employees
        .filter((employee) => !blocked.has(employee.id))
        .map((employee) => {
          const reasons: ScheduleWarning[] = [];
          const issue = shiftAvailabilityIssue({
            startAt: slot.startAt,
            endAt: slot.endAt,
            timeZone: input.timeZone,
            windows: employee.windows,
            exceptions: employee.exceptions,
            timeOff: employee.timeOff,
          });
          if (issue?.includes("time off")) reasons.push({ code: "PTO", message: `${employee.name} has approved time off` });
          else if (issue) reasons.push({ code: "UNAVAILABLE", message: `${employee.name} is not available for this shift` });
          const busy = [...employee.existingShifts, ...(planned.get(employee.id) ?? [])];
          if (busy.some((shift) => overlaps(slot.startAt, slot.endAt, shift.startAt, shift.endAt))) {
            reasons.push({ code: "DOUBLE_BOOKED", message: `${employee.name} is already scheduled then` });
          }
          const hard = reasons.some((reason) => reason.code === "PTO" || reason.code === "UNAVAILABLE" || reason.code === "DOUBLE_BOOKED");
          const soFar = weekHours.get(employee.id) ?? 0;
          const nextHours = soFar + hours;
          const soft: ScheduleWarning[] = [];
          if (!roleMatches(employee, slot.requiredRole)) {
            soft.push({ code: "QUALIFICATION", message: `${employee.name} does not match ${slot.requiredRole}` });
          }
          if (employee.maxWeeklyHours != null && nextHours > employee.maxWeeklyHours + 0.01) {
            soft.push({ code: "MAX_HOURS", message: `${employee.name} would exceed ${employee.maxWeeklyHours} max hours` });
          }
          if (employee.preferredWeeklyHours != null && nextHours > employee.preferredWeeklyHours + 0.01) {
            soft.push({ code: "PREFERRED_HOURS", message: `${employee.name} would pass preferred hours` });
          }
          const priced = shiftCost(employee, hours, soFar);
          if (priced.overtime) soft.push({ code: "OVERTIME", message: `${employee.name} would earn overtime` });
          if (slot.projectTitle && !employee.projectTitles.some((title) => title.toLowerCase() === slot.projectTitle!.toLowerCase())) {
            soft.push({ code: "QUALIFICATION", message: `${employee.name} is not assigned to ${slot.projectTitle}` });
          }
          let score = 100;
          if (!roleMatches(employee, slot.requiredRole)) score -= 40;
          if (slot.projectTitle && employee.projectTitles.some((title) => title.toLowerCase() === slot.projectTitle!.toLowerCase())) score += 25;
          if (priced.overtime) score -= 20;
          if (employee.maxWeeklyHours != null && nextHours > employee.maxWeeklyHours) score -= 30;
          score -= employee.hourlyRate;
          return { employee, hard, reasons: [...reasons, ...soft], score, priced, nextHours };
        })
        .filter((candidate) => !candidate.hard)
        .sort((a, b) => b.score - a.score);

      const choice = ranked[0];
      if (!choice) break;
      blocked.add(choice.employee.id);
      weekHours.set(choice.employee.id, choice.nextHours);
      const list = planned.get(choice.employee.id) ?? [];
      list.push({ startAt: slot.startAt, endAt: slot.endAt });
      planned.set(choice.employee.id, list);
      assignments.push({
        slotId: slot.id,
        employeeId: choice.employee.id,
        employeeName: choice.employee.name,
        locationId: slot.locationId ?? null,
        startAt: slot.startAt.toISOString(),
        endAt: slot.endAt.toISOString(),
        estimatedCost: choice.priced.cost,
        warnings: choice.reasons,
      });
      missing -= 1;
    }
    if (missing > 0) {
      unfilled.push({ slotId: slot.id, missing });
      warnings.push({
        code: "UNDERSTAFFED",
        message: `A shift starting ${slot.startAt.toISOString()} is short ${missing} ${missing === 1 ? "person" : "people"}`,
      });
    }
  }

  const estimatedLaborCost = Math.round(assignments.reduce((sum, row) => sum + row.estimatedCost, 0) * 100) / 100;
  const laborCostAlert =
    input.laborCostAlertAmount != null && estimatedLaborCost > input.laborCostAlertAmount;
  if (laborCostAlert) {
    warnings.push({
      code: "LABOR_COST",
      message: `Estimated labor cost $${estimatedLaborCost.toFixed(2)} is above $${input.laborCostAlertAmount!.toFixed(2)}`,
    });
  }
  for (const row of assignments) warnings.push(...row.warnings);
  return { assignments, unfilled, warnings, estimatedLaborCost, laborCostAlert };
}
