import { db } from "@/lib/db";
import type { ShiftStatus } from "@prisma/client";
import { createAuditLog } from "@/lib/audit";

export type ShiftInput = {
  employeeId: string;
  locationId?: string | null;
  startAt: Date;
  endAt: Date;
  notes?: string | null;
  status?: ShiftStatus;
};

export async function hasOverlappingShift(params: {
  businessId: string;
  employeeId: string;
  startAt: Date;
  endAt: Date;
  excludeShiftId?: string;
}): Promise<boolean> {
  const { businessId, employeeId, startAt, endAt, excludeShiftId } = params;
  const overlapping = await db.shift.findFirst({
    where: {
      businessId,
      employeeId,
      status: { not: "CANCELLED" },
      ...(excludeShiftId ? { id: { not: excludeShiftId } } : {}),
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
    select: { id: true },
  });
  return !!overlapping;
}

export function validateShiftTimes(startAt: Date, endAt: Date): string | null {
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    return "Invalid date or time";
  }
  if (endAt <= startAt) {
    return "End time must be after start time";
  }
  const durationHours = (endAt.getTime() - startAt.getTime()) / (1000 * 60 * 60);
  if (durationHours > 24) {
    return "Shift cannot exceed 24 hours";
  }
  return null;
}

export async function validateShiftEmployee(params: {
  businessId: string;
  employeeId: string;
}): Promise<{ ok: true; employee: { id: string; status: string } } | { ok: false; error: string; status: number }> {
  const employee = await db.employeeProfile.findFirst({
    where: {
      id: params.employeeId,
      businessId: params.businessId,
      deletedAt: null,
    },
    select: { id: true, status: true },
  });

  if (!employee) {
    return { ok: false, error: "Employee not found", status: 404 };
  }
  if (employee.status !== "ACTIVE") {
    return { ok: false, error: "Employee is not active", status: 422 };
  }
  return { ok: true, employee };
}

export async function validateShiftLocation(params: {
  businessId: string;
  locationId?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!params.locationId) return { ok: true };

  const location = await db.location.findFirst({
    where: {
      id: params.locationId,
      businessId: params.businessId,
      deletedAt: null,
      isActive: true,
    },
    select: { id: true },
  });

  if (!location) {
    return { ok: false, error: "The selected location is no longer available", status: 404 };
  }
  return { ok: true };
}

const shiftInclude = {
  employee: { select: { id: true, name: true } },
  location: { select: { id: true, name: true } },
} as const;

export async function createShift(params: {
  businessId: string;
  createdById: string;
  data: ShiftInput;
}) {
  const { businessId, createdById, data } = params;

  const employeeCheck = await validateShiftEmployee({ businessId, employeeId: data.employeeId });
  if (!employeeCheck.ok) {
    return { ok: false as const, error: employeeCheck.error, status: employeeCheck.status };
  }

  const locationCheck = await validateShiftLocation({ businessId, locationId: data.locationId });
  if (!locationCheck.ok) {
    return { ok: false as const, error: locationCheck.error, status: locationCheck.status };
  }

  const timeError = validateShiftTimes(data.startAt, data.endAt);
  if (timeError) {
    return { ok: false as const, error: timeError, status: 400 };
  }

  if (
    await hasOverlappingShift({
      businessId,
      employeeId: data.employeeId,
      startAt: data.startAt,
      endAt: data.endAt,
    })
  ) {
    return { ok: false as const, error: "This shift overlaps another shift", status: 409 };
  }

  const shift = await db.$transaction(async (tx) => {
    const created = await tx.shift.create({
      data: {
        businessId,
        employeeId: data.employeeId,
        locationId: data.locationId ?? null,
        startAt: data.startAt,
        endAt: data.endAt,
        notes: data.notes ?? null,
        status: data.status ?? "SCHEDULED",
        createdById,
      },
      include: shiftInclude,
    });

    await tx.auditLog.create({
      data: {
        businessId,
        employeeId: createdById,
        action: "WORKFORCE_CHANGE",
        entity: "Shift",
        entityId: created.id,
        details: {
          action: "created",
          employeeId: data.employeeId,
          startAt: data.startAt.toISOString(),
          endAt: data.endAt.toISOString(),
        },
      },
    });

    return created;
  });

  return { ok: true as const, shift };
}

export async function updateShift(params: {
  businessId: string;
  shiftId: string;
  actorId: string;
  data: Partial<ShiftInput>;
}) {
  const existing = await db.shift.findFirst({
    where: { id: params.shiftId, businessId: params.businessId },
  });

  if (!existing) {
    return { ok: false as const, error: "Shift not found", status: 404 };
  }

  const employeeId = params.data.employeeId ?? existing.employeeId;
  const startAt = params.data.startAt ?? existing.startAt;
  const endAt = params.data.endAt ?? existing.endAt;
  const locationId =
    params.data.locationId !== undefined ? params.data.locationId : existing.locationId;

  const employeeCheck = await validateShiftEmployee({ businessId: params.businessId, employeeId });
  if (!employeeCheck.ok) {
    return { ok: false as const, error: employeeCheck.error, status: employeeCheck.status };
  }

  const locationCheck = await validateShiftLocation({ businessId: params.businessId, locationId });
  if (!locationCheck.ok) {
    return { ok: false as const, error: locationCheck.error, status: locationCheck.status };
  }

  const timeError = validateShiftTimes(startAt, endAt);
  if (timeError) {
    return { ok: false as const, error: timeError, status: 400 };
  }

  if (
    await hasOverlappingShift({
      businessId: params.businessId,
      employeeId,
      startAt,
      endAt,
      excludeShiftId: params.shiftId,
    })
  ) {
    return { ok: false as const, error: "This shift overlaps another shift", status: 409 };
  }

  const shift = await db.$transaction(async (tx) => {
    const updated = await tx.shift.update({
      where: { id: params.shiftId },
      data: {
        ...(params.data.employeeId ? { employeeId: params.data.employeeId } : {}),
        ...(params.data.locationId !== undefined ? { locationId: params.data.locationId } : {}),
        ...(params.data.startAt ? { startAt: params.data.startAt } : {}),
        ...(params.data.endAt ? { endAt: params.data.endAt } : {}),
        ...(params.data.notes !== undefined ? { notes: params.data.notes } : {}),
        ...(params.data.status ? { status: params.data.status } : {}),
      },
      include: shiftInclude,
    });

    await tx.auditLog.create({
      data: {
        businessId: params.businessId,
        employeeId: params.actorId,
        action: "WORKFORCE_CHANGE",
        entity: "Shift",
        entityId: params.shiftId,
        details: params.data,
      },
    });

    return updated;
  });

  return { ok: true as const, shift };
}

export async function cancelShift(params: {
  businessId: string;
  shiftId: string;
  actorId: string;
}) {
  const existing = await db.shift.findFirst({
    where: { id: params.shiftId, businessId: params.businessId },
  });

  if (!existing) {
    return { ok: false as const, error: "Shift not found", status: 404 };
  }

  await db.$transaction(async (tx) => {
    await tx.shift.update({
      where: { id: params.shiftId },
      data: { status: "CANCELLED" },
    });

    await tx.auditLog.create({
      data: {
        businessId: params.businessId,
        employeeId: params.actorId,
        action: "WORKFORCE_CHANGE",
        entity: "Shift",
        entityId: params.shiftId,
        details: { action: "cancelled" },
      },
    });
  });

  return { ok: true as const };
}

/** Non-blocking audit for legacy call sites */
export async function logShiftAudit(params: Parameters<typeof createAuditLog>[0]) {
  try {
    await createAuditLog(params);
  } catch (error) {
    console.error("Audit log failed (non-blocking):", error);
  }
}
