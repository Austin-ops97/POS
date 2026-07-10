import { db } from "@/lib/db";
import { getBreakMinutes, getWorkedMinutes } from "./time-clock-service";
import type { TimeEntry, TimeBreak, Shift, PayrollBonus } from "@prisma/client";

type TimeEntryWithBreaks = TimeEntry & { breaks: TimeBreak[] };

export type PayrollEmployeeRow = {
  employeeId: string;
  employeeName: string;
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
  const end = entry.clockOut ?? new Date();
  const totalHours = hoursFromMs(end.getTime() - entry.clockIn.getTime());
  const breakHours = getBreakMinutes(entry.breaks) / 60;
  const actualHours = getWorkedMinutes(entry, end) / 60;
  return { actualHours, breakHours: totalHours - actualHours };
}

export async function computePayrollSummary(params: {
  businessId: string;
  periodStart: Date;
  periodEnd: Date;
  overtimeThreshold: number;
}): Promise<PayrollEmployeeRow[]> {
  const { businessId, periodStart, periodEnd, overtimeThreshold } = params;

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
        startAt: { gte: periodStart, lte: periodEnd },
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

  return employees.map((emp) => {
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
    }

    const scheduledHours = empShifts.reduce((sum, s) => sum + shiftHours(s), 0);

    if (scheduledHours > 0 && Math.abs(actualHours - scheduledHours) > 0.25) {
      flags.push("Schedule variance");
    }

    if (empTimeOff.length > 0) {
      flags.push("Approved time off");
    }

    const hourlyWage = Number(emp.hourlyWage ?? 0);
    const regularHours = Math.min(actualHours, overtimeThreshold);
    const overtimeHours = Math.max(0, actualHours - overtimeThreshold);
    const regularPay = regularHours * hourlyWage;
    const overtimePay = overtimeHours * hourlyWage * 1.5;
    const bonusTotal = empBonuses.reduce((sum, b) => sum + Number(b.amount), 0);

    return {
      employeeId: emp.id,
      employeeName: emp.name,
      hourlyWage,
      scheduledHours: Math.round(scheduledHours * 100) / 100,
      actualHours: Math.round(actualHours * 100) / 100,
      breakHours: Math.round(breakHours * 100) / 100,
      regularHours: Math.round(regularHours * 100) / 100,
      overtimeHours: Math.round(overtimeHours * 100) / 100,
      regularPay: Math.round(regularPay * 100) / 100,
      overtimePay: Math.round(overtimePay * 100) / 100,
      bonusTotal: Math.round(bonusTotal * 100) / 100,
      totalPay: Math.round((regularPay + overtimePay + bonusTotal) * 100) / 100,
      flags,
    };
  });
}

export function payrollToCsv(rows: PayrollEmployeeRow[]): string {
  const headers = [
    "Employee",
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
      r.employeeName,
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
      r.flags.join("; "),
    ].join(",")
  );
  return [headers.join(","), ...lines].join("\n");
}
