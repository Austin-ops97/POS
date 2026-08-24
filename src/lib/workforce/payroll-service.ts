import { db } from "@/lib/db";
import { getBreakMinutes, getWorkedMinutes } from "./time-clock-service";
import { getEffectiveCompensation, resolveDisplayName } from "./employee-service";
import { getWeekStart } from "./pay-period";
import { collectTimeEntryFlags, isLongShift } from "./timesheet-flags";
import type { TimeEntry, TimeBreak, Shift, PayrollBonus } from "@prisma/client";

type TimeEntryWithBreaks = TimeEntry & { breaks: TimeBreak[] };

export type PayrollEmployeeRow = {
  employeeId: string;
  employeeName: string;
  payType: string;
  hourlyWage: number;
  scheduledHours: number;
  actualHours: number;
  breakHours: number;
  ptoHours?: number;
  sickHours?: number;
  vacationHours?: number;
  holidayHours?: number;
  unpaidHours?: number;
  regularHours: number;
  overtimeHours: number;
  regularPay: number;
  overtimePay: number;
  bonusTotal: number;
  totalPay: number;
  flags: string[];
};

function hoursFromMs(ms: number): number {
  return ms / (1000 * 60 * 60);
}

function shiftHours(shift: Shift): number {
  return hoursFromMs(shift.endAt.getTime() - shift.startAt.getTime());
}

export function computeEntryHours(entry: TimeEntryWithBreaks): {
  actualHours: number;
  breakHours: number;
} {
  if (entry.status === "ACTIVE" || !entry.clockOut) {
    return { actualHours: 0, breakHours: getBreakMinutes(entry.breaks) / 60 };
  }
  const end = entry.clockOut;
  const totalHours = hoursFromMs(end.getTime() - entry.clockIn.getTime());
  const actualHours = getWorkedMinutes(entry, end) / 60;
  return { actualHours, breakHours: totalHours - actualHours };
}

export function computeWeeklyOvertimeHours(
  entries: TimeEntryWithBreaks[],
  weekStartDay: number,
  overtimeThreshold: number,
  paidBreaks = false
): { regularHours: number; overtimeHours: number } {
  const hoursByWeek = new Map<string, number>();

  for (const entry of entries) {
    if (entry.status === "ACTIVE" || !entry.clockOut) continue;
    const weekKey = getWeekStart(entry.clockIn, weekStartDay).toISOString();
    const { actualHours: rawActualHours, breakHours } = computeEntryHours(entry);
    const actualHours = paidBreaks ? rawActualHours + breakHours : rawActualHours;
    hoursByWeek.set(weekKey, (hoursByWeek.get(weekKey) ?? 0) + actualHours);
  }

  let regularHours = 0;
  let overtimeHours = 0;
  for (const weekHours of hoursByWeek.values()) {
    regularHours += Math.min(weekHours, overtimeThreshold);
    overtimeHours += Math.max(0, weekHours - overtimeThreshold);
  }

  return { regularHours, overtimeHours };
}

function escapeCsvValue(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function computePayrollSummary(params: {
  businessId: string;
  periodStart: Date;
  periodEnd: Date;
  overtimeThreshold: number;
  weekStartDay?: number;
  payPeriodType?: "WEEKLY" | "BIWEEKLY" | "SEMIMONTHLY" | "MONTHLY";
  paidBreaks?: boolean;
}): Promise<PayrollEmployeeRow[]> {
  const { businessId, periodStart, periodEnd, overtimeThreshold, weekStartDay = 0, payPeriodType = "BIWEEKLY", paidBreaks = false } = params;

  const employees = await db.employeeProfile.findMany({
    where: { businessId, deletedAt: null, status: "ACTIVE" },
    orderBy: { name: "asc" },
  });

  const [entries, shifts, bonuses, timeOff] = await Promise.all([
    db.timeEntry.findMany({
      where: {
        businessId,
        clockIn: { gte: periodStart, lte: periodEnd },
      },
      include: { breaks: true },
    }),
    db.shift.findMany({
      where: {
        businessId,
        status: { not: "CANCELLED" },
        startAt: { lt: periodEnd },
        endAt: { gt: periodStart },
      },
    }),
    db.payrollBonus.findMany({
      where: {
        businessId,
        payPeriodStart: periodStart,
        payPeriodEnd: periodEnd,
      },
    }),
    db.timeOffRequest.findMany({
      where: {
        businessId,
        status: "APPROVED",
        startDate: { lte: periodEnd },
        endDate: { gte: periodStart },
      },
    }),
  ]);

  const entriesByEmployee = new Map<string, TimeEntryWithBreaks[]>();
  for (const entry of entries) {
    const list = entriesByEmployee.get(entry.employeeId) ?? [];
    list.push(entry);
    entriesByEmployee.set(entry.employeeId, list);
  }

  const shiftsByEmployee = new Map<string, Shift[]>();
  for (const shift of shifts) {
    const list = shiftsByEmployee.get(shift.employeeId) ?? [];
    list.push(shift);
    shiftsByEmployee.set(shift.employeeId, list);
  }

  const bonusesByEmployee = new Map<string, PayrollBonus[]>();
  for (const bonus of bonuses) {
    const list = bonusesByEmployee.get(bonus.employeeId) ?? [];
    list.push(bonus);
    bonusesByEmployee.set(bonus.employeeId, list);
  }

  const timeOffByEmployee = new Map<string, typeof timeOff>();
  for (const req of timeOff) {
    const list = timeOffByEmployee.get(req.employeeId) ?? [];
    list.push(req);
    timeOffByEmployee.set(req.employeeId, list);
  }

  const rows: PayrollEmployeeRow[] = [];

  for (const emp of employees) {
    const empEntries = entriesByEmployee.get(emp.id) ?? [];
    const empShifts = shiftsByEmployee.get(emp.id) ?? [];
    const empBonuses = bonusesByEmployee.get(emp.id) ?? [];
    const empTimeOff = timeOffByEmployee.get(emp.id) ?? [];
    const leaveHours = { PTO: 0, SICK: 0, VACATION: 0, HOLIDAY: 0, UNPAID: 0, OTHER: 0 };
    for (const request of empTimeOff) {
      const requestStart = new Date(request.startDate).getTime();
      const requestEnd = new Date(request.endDate).getTime();
      const totalDays = Math.max(1, Math.round((requestEnd - requestStart) / 86400000) + 1);
      const overlapStart = Math.max(requestStart, periodStart.getTime());
      const overlapEnd = Math.min(requestEnd, periodEnd.getTime());
      const overlapDays = Math.max(0, Math.round((overlapEnd - overlapStart) / 86400000) + 1);
      leaveHours[request.type] += Number(request.hoursRequested) * (overlapDays / totalDays);
    }
    const ptoHours = leaveHours.PTO;
    const sickHours = leaveHours.SICK;
    const vacationHours = leaveHours.VACATION;
    const holidayHours = leaveHours.HOLIDAY;
    const unpaidHours = leaveHours.UNPAID;
    const paidLeaveHours = ptoHours + sickHours + vacationHours + holidayHours;

    let actualHours = 0;
    let breakHours = 0;
    const flags: string[] = [];

    for (const entry of empEntries) {
      const { actualHours: rawActualHours, breakHours: bh } = computeEntryHours(entry);
      const ah = paidBreaks ? rawActualHours + bh : rawActualHours;
      actualHours += ah;
      breakHours += bh;
      for (const flag of collectTimeEntryFlags(entry)) {
        if (!flags.includes(flag)) flags.push(flag);
      }
      // Deduplicate the generic missing clock-out when a more specific long-shift flag exists
      if (
        (entry.status === "ACTIVE" || !entry.clockOut) &&
        isLongShift(entry)
      ) {
        const idx = flags.indexOf("Missing clock-out");
        if (idx >= 0) flags.splice(idx, 1);
      }
    }

    const scheduledHours = empShifts.reduce((sum, s) => sum + shiftHours(s), 0);

    if (scheduledHours > 0 && Math.abs(actualHours - scheduledHours) > 0.25) {
      flags.push("Schedule variance");
    }

    if (empTimeOff.length > 0) {
      flags.push(paidLeaveHours > 0 ? `Paid leave: ${paidLeaveHours.toFixed(2)}h` : "Approved unpaid time off");
    }

    const compensation = await getEffectiveCompensation(emp.id, periodEnd);
    const payType = compensation?.payType ?? (emp.hourlyWage ? "HOURLY" : "HOURLY");
    const hourlyWage = Number(compensation?.hourlyRate ?? emp.hourlyWage ?? 0);
    const otMultiplier = Number(compensation?.overtimeMultiplier ?? 1.5);
    const otEligible = compensation?.overtimeEligible ?? true;

    let regularHours = 0;
    let overtimeHours = 0;
    let regularPay = 0;
    let overtimePay = 0;
    let totalPay = 0;

    if (payType === "SALARY") {
      const annual = Number(compensation?.annualSalary ?? 0);
      const periodsPerYear = { WEEKLY: 52, BIWEEKLY: 26, SEMIMONTHLY: 24, MONTHLY: 12 }[payPeriodType];
      totalPay = annual / periodsPerYear;
      regularHours = actualHours;
      flags.push("Salary employee");
    } else {
      const ot = computeWeeklyOvertimeHours(empEntries, weekStartDay, overtimeThreshold, paidBreaks);
      regularHours = ot.regularHours + paidLeaveHours;
      overtimeHours = otEligible ? ot.overtimeHours : 0;
      regularPay = regularHours * hourlyWage;
      overtimePay = overtimeHours * hourlyWage * otMultiplier;
      totalPay = regularPay + overtimePay;
    }

    const bonusTotal = empBonuses.reduce((sum, b) => sum + Number(b.amount), 0);
    totalPay += bonusTotal;

    rows.push({
      employeeId: emp.id,
      employeeName: resolveDisplayName(emp),
      payType,
      hourlyWage,
      scheduledHours: Math.round(scheduledHours * 100) / 100,
      actualHours: Math.round(actualHours * 100) / 100,
      breakHours: Math.round(breakHours * 100) / 100,
      ptoHours: Math.round(ptoHours * 100) / 100,
      sickHours: Math.round(sickHours * 100) / 100,
      vacationHours: Math.round(vacationHours * 100) / 100,
      holidayHours: Math.round(holidayHours * 100) / 100,
      unpaidHours: Math.round(unpaidHours * 100) / 100,
      regularHours: Math.round(regularHours * 100) / 100,
      overtimeHours: Math.round(overtimeHours * 100) / 100,
      regularPay: Math.round(regularPay * 100) / 100,
      overtimePay: Math.round(overtimePay * 100) / 100,
      bonusTotal: Math.round(bonusTotal * 100) / 100,
      totalPay: Math.round(totalPay * 100) / 100,
      flags,
    });
  }

  return rows;
}

export function payrollToCsv(rows: PayrollEmployeeRow[], period = { start: "", end: "", payDate: "" }): string {
  const headers = [
    "Employee",
    "Pay Type",
    "Pay Period",
    "Pay Date",
    "Hourly Wage",
    "Regular Hrs",
    "OT Hrs",
    "PTO Hrs",
    "Sick Hrs",
    "Vacation Hrs",
    "Holiday Hrs",
    "Unpaid Hrs",
    "Regular Pay",
    "OT Pay",
    "Bonuses",
    "Total Pay",
    "Flags",
  ];
  const lines = rows.map((r) =>
    [
      escapeCsvValue(r.employeeName),
      r.payType,
      `${period.start} to ${period.end}`,
      period.payDate,
      r.hourlyWage.toFixed(2),
      r.regularHours.toFixed(2),
      r.overtimeHours.toFixed(2),
      (r.ptoHours ?? 0).toFixed(2),
      (r.sickHours ?? 0).toFixed(2),
      (r.vacationHours ?? 0).toFixed(2),
      (r.holidayHours ?? 0).toFixed(2),
      (r.unpaidHours ?? 0).toFixed(2),
      r.regularPay.toFixed(2),
      r.overtimePay.toFixed(2),
      r.bonusTotal.toFixed(2),
      r.totalPay.toFixed(2),
      escapeCsvValue(r.flags.join("; ")),
    ].join(",")
  );
  return [headers.join(","), ...lines].join("\n");
}
