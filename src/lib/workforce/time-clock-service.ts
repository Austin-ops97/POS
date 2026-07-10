import { db } from "@/lib/db";
import { verifyPin } from "@/lib/pin";
import type { TimeBreak, TimeEntry } from "@prisma/client";

export type ClockState = "OFF_CLOCK" | "ON_CLOCK" | "ON_BREAK";

export type TimeEntryWithBreaks = TimeEntry & { breaks: TimeBreak[] };

export function getClockState(entry: TimeEntryWithBreaks | null): ClockState {
  if (!entry) return "OFF_CLOCK";
  const activeBreak = entry.breaks.find((b) => !b.breakEnd);
  if (activeBreak) return "ON_BREAK";
  return "ON_CLOCK";
}

export function getBreakMinutes(breaks: TimeBreak[]): number {
  let total = 0;
  for (const b of breaks) {
    const end = b.breakEnd ?? new Date();
    total += (end.getTime() - b.breakStart.getTime()) / (1000 * 60);
  }
  return total;
}

export function getWorkedMinutes(
  entry: TimeEntryWithBreaks,
  asOf: Date = new Date()
): number {
  const end = entry.clockOut ?? asOf;
  const total = (end.getTime() - entry.clockIn.getTime()) / (1000 * 60);
  return Math.max(0, total - getBreakMinutes(entry.breaks));
}

export async function findEmployeeByPin(
  businessId: string,
  pin: string
): Promise<{ id: string; name: string; pinHash: string } | null> {
  const employees = await db.employeeProfile.findMany({
    where: {
      businessId,
      deletedAt: null,
      status: "ACTIVE",
      pinHash: { not: null },
    },
    select: { id: true, name: true, pinHash: true },
  });

  for (const emp of employees) {
    if (emp.pinHash && (await verifyPin(pin, emp.pinHash))) {
      return { id: emp.id, name: emp.name, pinHash: emp.pinHash };
    }
  }
  return null;
}

export async function getActiveTimeEntry(
  employeeId: string
): Promise<TimeEntryWithBreaks | null> {
  return db.timeEntry.findFirst({
    where: { employeeId, status: "ACTIVE" },
    include: { breaks: { orderBy: { breakStart: "asc" } } },
  });
}

export async function getTodayHours(employeeId: string): Promise<number> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const entries = await db.timeEntry.findMany({
    where: {
      employeeId,
      clockIn: { gte: todayStart },
    },
    include: { breaks: true },
  });

  let minutes = 0;
  for (const entry of entries) {
    minutes += getWorkedMinutes(entry);
  }
  return minutes / 60;
}

export type PunchResult = {
  employeeName: string;
  action: string;
  clockState: ClockState;
  clockedInAt?: Date;
  todayHours: number;
};

export async function lookupEmployeeClockState(
  businessId: string,
  pin: string
): Promise<PunchResult> {
  const employee = await findEmployeeByPin(businessId, pin);
  if (!employee) {
    throw new Error("Invalid PIN");
  }

  const activeEntry = await getActiveTimeEntry(employee.id);
  const clockState = getClockState(activeEntry);
  const todayHours = await getTodayHours(employee.id);

  return {
    employeeName: employee.name,
    action: "LOOKUP",
    clockState,
    clockedInAt: activeEntry?.clockIn,
    todayHours,
  };
}

export async function executePunch(params: {
  businessId: string;
  employeeId: string;
  employeeName: string;
  action: "CLOCK_IN" | "CLOCK_OUT" | "START_BREAK" | "END_BREAK";
  locationId?: string;
}): Promise<PunchResult> {
  const now = new Date();
  const activeEntry = await getActiveTimeEntry(params.employeeId);
  const state = getClockState(activeEntry);

  if (params.action === "CLOCK_IN") {
    if (state !== "OFF_CLOCK") {
      throw new Error("Already clocked in");
    }
    await db.timeEntry.create({
      data: {
        businessId: params.businessId,
        employeeId: params.employeeId,
        locationId: params.locationId,
        clockIn: now,
        source: "PIN_KIOSK",
        status: "ACTIVE",
      },
    });
    const todayHours = await getTodayHours(params.employeeId);
    return {
      employeeName: params.employeeName,
      action: "CLOCK_IN",
      clockState: "ON_CLOCK",
      clockedInAt: now,
      todayHours,
    };
  }

  if (!activeEntry) {
    throw new Error("Not clocked in");
  }

  if (params.action === "CLOCK_OUT") {
    if (state === "ON_BREAK") {
      throw new Error("End your break before clocking out");
    }
    const activeBreak = activeEntry.breaks.find((b) => !b.breakEnd);
    if (activeBreak) {
      await db.timeBreak.update({
        where: { id: activeBreak.id },
        data: { breakEnd: now },
      });
    }
    await db.timeEntry.update({
      where: { id: activeEntry.id },
      data: { clockOut: now, status: "COMPLETED" },
    });
    const todayHours = await getTodayHours(params.employeeId);
    return {
      employeeName: params.employeeName,
      action: "CLOCK_OUT",
      clockState: "OFF_CLOCK",
      todayHours,
    };
  }

  if (params.action === "START_BREAK") {
    if (state !== "ON_CLOCK") {
      throw new Error("Cannot start break — not clocked in or already on break");
    }
    await db.timeBreak.create({
      data: { timeEntryId: activeEntry.id, breakStart: now },
    });
    const todayHours = await getTodayHours(params.employeeId);
    return {
      employeeName: params.employeeName,
      action: "START_BREAK",
      clockState: "ON_BREAK",
      clockedInAt: activeEntry.clockIn,
      todayHours,
    };
  }

  if (params.action === "END_BREAK") {
    if (state !== "ON_BREAK") {
      throw new Error("Not currently on break");
    }
    const activeBreak = activeEntry.breaks.find((b) => !b.breakEnd);
    if (!activeBreak) {
      throw new Error("No active break found");
    }
    await db.timeBreak.update({
      where: { id: activeBreak.id },
      data: { breakEnd: now },
    });
    const todayHours = await getTodayHours(params.employeeId);
    return {
      employeeName: params.employeeName,
      action: "END_BREAK",
      clockState: "ON_CLOCK",
      clockedInAt: activeEntry.clockIn,
      todayHours,
    };
  }

  throw new Error("Invalid action");
}
