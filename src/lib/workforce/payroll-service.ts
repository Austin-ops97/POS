import { db } from "@/lib/db";
import { getBreakMinutes, getWorkedMinutes } from "./time-clock-service";
import { getEffectiveCompensation } from "./employee-service";
import { getWeekStart } from "./pay-period";
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
  const breakHours = getBreakMinutes(entry.breaks) / 60;
  const actualHours = getWorkedMinutes(entry, end) / 60;
  return { actualHours, breakHours: totalHours - actualHours };
}

export function computeWeeklyOvertimeHours(
  entries: TimeEntryWithBreaks[],
  weekStartDay: number,
  overtimeThreshold: number
): { regularHours: number; overtimeHours: number } {
  const hoursByWeek = new Map<string, number>();

  for (const entry of entries) {
    if (entry.status === "ACTIVE" || !entry.clockOut) continue;
    const weekKey = getWeekStart(entry.clockIn, weekStartDay).toISOString();
    const { actualHours } = computeEntryHours(entry);
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
}): Promise<PayrollEmployeeRow[]> {
  const { businessId, periodStart, periodEnd, overtimeThreshold, weekStartDay = 0 } = params;

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

    let actualHours = 0;
    let breakHours = 0;
    const flags: string[] = [];

    for (const entry of empEntries) {
      const { actualHours: ah, breakHours: bh } = computeEntryHours(entry);
      actualHours += ah;
      breakHours += bh;
      if (entry.status === "ACTIVE" || !entry.clockOut) {
        flags.push("Missing clock-out");
      }
      for (const br of entry.breaks) {
        if (!br.breakEnd) flags.push("Open break");
      }
    }

    const scheduledHours = empShifts.reduce((sum, s) => sum + shiftHours(s), 0);

    if (scheduledHours > 0 && Math.abs(actualHours - scheduledHours) > 0.25) {
      flags.push("Schedule variance");
    }

    if (empTimeOff.length > 0) {
      flags.push("Approved time off");
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
      const periodDays =
        (periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24) + 1;
      totalPay = (annual / 365) * periodDays;
      regularHours = actualHours;
      flags.push("Salary employee");
    } else {
      const ot = computeWeeklyOvertimeHours(empEntries, weekStartDay, overtimeThreshold);
      regularHours = ot.regularHours;
      overtimeHours = otEligible ? ot.overtimeHours : 0;
      regularPay = regularHours * hourlyWage;
      overtimePay = overtimeHours * hourlyWage * otMultiplier;
      totalPay = regularPay + overtimePay;
    }

    const bonusTotal = empBonuses.reduce((sum, b) => sum + Number(b.amount), 0);
    totalPay += bonusTotal;

    rows.push({
      employeeId: emp.id,
      employeeName: emp.name,
      payType,
      hourlyWage,
      scheduledHours: Math.round(scheduledHours * 100) / 100,
      actualHours: Math.round(actualHours * 100) / 100,
      breakHours: Math.round(breakHours * 100) / 100,
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

export function payrollToCsv(rows: PayrollEmployeeRow[]): string {
  const headers = [
    "Employee",
    "Pay Type",
    "Hourly Wage",
    "Scheduled Hrs",
    "Actual Hrs",
    "Break Hrs",
    "Regular Hrs",
    "OT Hrs",
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
      r.hourlyWage.toFixed(2),
      r.scheduledHours.toFixed(2),
      r.actualHours.toFixed(2),
      r.breakHours.toFixed(2),
      r.regularHours.toFixed(2),
      r.overtimeHours.toFixed(2),
      r.regularPay.toFixed(2),
      r.overtimePay.toFixed(2),
      r.bonusTotal.toFixed(2),
      r.totalPay.toFixed(2),
      escapeCsvValue(r.flags.join("; ")),
    ].join(",")
  );
  return [headers.join(","), ...lines].join("\n");
}
