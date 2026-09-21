import { db } from "@/lib/db";
import { shiftAvailabilityIssue, type AvailabilityException, type AvailabilityWindow, type TimeOffSpan } from "./availability";

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export async function availabilityBlockReason(params: {
  businessId: string;
  employeeId: string;
  locationId?: string | null;
  startAt: Date;
  endAt: Date;
}): Promise<string | null> {
  const [windows, exceptions, timeOff, location] = await Promise.all([
    db.employeeAvailabilityWindow.findMany({
      where: { businessId: params.businessId, employeeId: params.employeeId },
    }),
    db.employeeAvailabilityException.findMany({
      where: { businessId: params.businessId, employeeId: params.employeeId },
    }),
    db.timeOffRequest.findMany({
      where: {
        businessId: params.businessId,
        employeeId: params.employeeId,
        status: "APPROVED",
        startDate: { lte: params.endAt },
        endDate: { gte: params.startAt },
      },
    }),
    params.locationId
      ? db.location.findFirst({
          where: { id: params.locationId, businessId: params.businessId },
          select: { timezone: true },
        })
      : Promise.resolve(null),
  ]);

  return shiftAvailabilityIssue({
    startAt: params.startAt,
    endAt: params.endAt,
    timeZone: location?.timezone ?? "UTC",
    windows: windows.map((window) => ({ weekday: window.weekday, startMinute: window.startMinute, endMinute: window.endMinute })),
    exceptions: exceptions.map((exception) => ({
      date: dateKey(exception.date),
      available: exception.available,
      startMinute: exception.startMinute,
      endMinute: exception.endMinute,
    })),
    timeOff: timeOff.map((request) => ({ startDate: dateKey(request.startDate), endDate: dateKey(request.endDate) })),
  });
}

export async function replaceAvailability(params: {
  businessId: string;
  employeeId: string;
  maxWeeklyHours: number | null;
  preferredWeeklyHours: number | null;
  windows: AvailabilityWindow[];
}) {
  await db.$transaction([
    db.employeeProfile.update({
      where: { id: params.employeeId },
      data: {
        maxWeeklyHours: params.maxWeeklyHours,
        preferredWeeklyHours: params.preferredWeeklyHours,
      },
    }),
    db.employeeAvailabilityWindow.deleteMany({
      where: { businessId: params.businessId, employeeId: params.employeeId },
    }),
    ...(params.windows.length
      ? [
          db.employeeAvailabilityWindow.createMany({
            data: params.windows.map((window) => ({
              businessId: params.businessId,
              employeeId: params.employeeId,
              weekday: window.weekday,
              startMinute: window.startMinute,
              endMinute: window.endMinute,
            })),
          }),
        ]
      : []),
  ]);
}

export async function addAvailabilityException(params: {
  businessId: string;
  employeeId: string;
  date: Date;
  available: boolean;
  startMinute: number | null;
  endMinute: number | null;
  note?: string | null;
}) {
  return db.employeeAvailabilityException.create({
    data: {
      businessId: params.businessId,
      employeeId: params.employeeId,
      date: params.date,
      available: params.available,
      startMinute: params.startMinute,
      endMinute: params.endMinute,
      note: params.note ?? null,
    },
  });
}

export async function deleteAvailabilityException(params: { businessId: string; employeeId: string; exceptionId: string }) {
  const existing = await db.employeeAvailabilityException.findFirst({
    where: { id: params.exceptionId, businessId: params.businessId, employeeId: params.employeeId },
  });
  if (!existing) return false;
  await db.employeeAvailabilityException.delete({ where: { id: existing.id } });
  return true;
}

export type LoadedAvailability = {
  windows: AvailabilityWindow[];
  exceptions: AvailabilityException[];
  timeOff: TimeOffSpan[];
};

export async function loadAvailabilityMap(businessId: string, employeeIds: string[], from: Date, to: Date) {
  const [windows, exceptions, timeOff] = await Promise.all([
    db.employeeAvailabilityWindow.findMany({ where: { businessId, employeeId: { in: employeeIds } } }),
    db.employeeAvailabilityException.findMany({
      where: { businessId, employeeId: { in: employeeIds }, date: { gte: from, lte: to } },
    }),
    db.timeOffRequest.findMany({
      where: {
        businessId,
        employeeId: { in: employeeIds },
        status: "APPROVED",
        startDate: { lte: to },
        endDate: { gte: from },
      },
    }),
  ]);
  const map = new Map<string, LoadedAvailability>();
  for (const id of employeeIds) map.set(id, { windows: [], exceptions: [], timeOff: [] });
  for (const window of windows) {
    map.get(window.employeeId)?.windows.push({ weekday: window.weekday, startMinute: window.startMinute, endMinute: window.endMinute });
  }
  for (const exception of exceptions) {
    map.get(exception.employeeId)?.exceptions.push({
      date: dateKey(exception.date),
      available: exception.available,
      startMinute: exception.startMinute,
      endMinute: exception.endMinute,
    });
  }
  for (const request of timeOff) {
    map.get(request.employeeId)?.timeOff.push({ startDate: dateKey(request.startDate), endDate: dateKey(request.endDate) });
  }
  return map;
}
