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

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    await ensurePaidSubscription(ctx);

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const locationId = searchParams.get("locationId");
    const employeeId = searchParams.get("employeeId");

    if (!from || !to) {
      return NextResponse.json(
        { error: "from and to query params are required" },
        { status: 400 }
      );
    }

    const shifts = await db.shift.findMany({
      where: {
        businessId: ctx.business.id,
        ...(locationId ? { locationId } : {}),
        ...(employeeId ? { employeeId } : {}),
        startAt: { lt: new Date(to) },
        endAt: { gt: new Date(from) },
      },
      include: {
        employee: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
      },
      orderBy: { startAt: "asc" },
    });

    return NextResponse.json(shifts);
  } catch (error) {
    return handleApiError(error, "GET /api/workforce/shifts");
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    await ensurePaidSubscription(ctx);

    if (!hasPermission(ctx, PERMISSIONS.MANAGE_WORKFORCE)) {
      throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_WORKFORCE}`);
    }

    const body = await request.json();
    const data = shiftSchema.parse(body);

    const startAt = new Date(data.startAt);
    const endAt = new Date(data.endAt);

    const timeError = validateShiftTimes(startAt, endAt);
    if (timeError) {
      return NextResponse.json({ error: timeError }, { status: 400 });
    }

    const employee = await db.employeeProfile.findFirst({
      where: {
        id: data.employeeId,
        businessId: ctx.business.id,
        deletedAt: null,
      },
    });
    if (!employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    if (await hasOverlappingShift(data.employeeId, startAt, endAt)) {
      return NextResponse.json(
        { error: "Shift overlaps with an existing shift" },
        { status: 409 }
      );
    }

    const shift = await db.shift.create({
      data: {
        businessId: ctx.business.id,
        employeeId: data.employeeId,
        locationId: data.locationId,
        startAt,
        endAt,
        notes: data.notes,
        createdById: ctx.employee.id,
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
      entityId: shift.id,
      details: { action: "created", employeeId: data.employeeId, startAt, endAt },
    });

    return NextResponse.json(shift, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/workforce/shifts");
  }
}
