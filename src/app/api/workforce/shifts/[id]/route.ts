import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, hasPermission } from "@/lib/auth";
import { ensurePaidSubscription } from "@/lib/subscription-server";
import { shiftSchema } from "@/lib/validations/workforce";
import { PERMISSIONS } from "@/lib/permissions";
import {
  hasOverlappingShift,
  validateShiftTimes,
} from "@/lib/workforce/schedule-service";
import { createAuditLog } from "@/lib/audit";
import { handleApiError } from "@/lib/api-utils";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const ctx = await requireAuth();
    await ensurePaidSubscription(ctx);

    if (!hasPermission(ctx, PERMISSIONS.MANAGE_WORKFORCE)) {
      throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_WORKFORCE}`);
    }

    const { id } = await params;
    const body = await request.json();
    const data = shiftSchema.partial().parse(body);

    const existing = await db.shift.findFirst({
      where: { id, businessId: ctx.business.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Shift not found" }, { status: 404 });
    }

    const startAt = data.startAt ? new Date(data.startAt) : existing.startAt;
    const endAt = data.endAt ? new Date(data.endAt) : existing.endAt;
    const employeeId = data.employeeId ?? existing.employeeId;

    const timeError = validateShiftTimes(startAt, endAt);
    if (timeError) {
      return NextResponse.json({ error: timeError }, { status: 400 });
    }

    if (await hasOverlappingShift(employeeId, startAt, endAt, id)) {
      return NextResponse.json(
        { error: "Shift overlaps with an existing shift" },
        { status: 409 }
      );
    }

    const shift = await db.shift.update({
      where: { id },
      data: {
        ...(data.employeeId ? { employeeId: data.employeeId } : {}),
        ...(data.locationId !== undefined ? { locationId: data.locationId } : {}),
        ...(data.startAt ? { startAt } : {}),
        ...(data.endAt ? { endAt } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.status ? { status: data.status } : {}),
      },
      include: {
        employee: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
      },
    });

    await createAuditLog({
      businessId: ctx.business.id,
      employeeId: ctx.employee.id,
      action: "WORKFORCE_CHANGE",
      entity: "Shift",
      entityId: id,
      details: data,
    });

    return NextResponse.json(shift);
  } catch (error) {
    return handleApiError(error, "PATCH /api/workforce/shifts/[id]");
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const ctx = await requireAuth();
    await ensurePaidSubscription(ctx);

    if (!hasPermission(ctx, PERMISSIONS.MANAGE_WORKFORCE)) {
      throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_WORKFORCE}`);
    }

    const { id } = await params;

    const existing = await db.shift.findFirst({
      where: { id, businessId: ctx.business.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Shift not found" }, { status: 404 });
    }

    await db.shift.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    await createAuditLog({
      businessId: ctx.business.id,
      employeeId: ctx.employee.id,
      action: "WORKFORCE_CHANGE",
      entity: "Shift",
      entityId: id,
      details: { action: "cancelled" },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "DELETE /api/workforce/shifts/[id]");
  }
}
