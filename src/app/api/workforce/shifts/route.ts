import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, hasPermission } from "@/lib/auth";
import { ensurePaidSubscription } from "@/lib/subscription-server";
import { shiftSchema } from "@/lib/validations/workforce";
import { PERMISSIONS } from "@/lib/permissions";
import { createShift } from "@/lib/workforce/schedule-service";
import { handleApiError } from "@/lib/api-utils";

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    await ensurePaidSubscription(ctx);

    if (
      !hasPermission(ctx, PERMISSIONS.VIEW_WORKFORCE) &&
      !hasPermission(ctx, PERMISSIONS.MANAGE_WORKFORCE)
    ) {
      throw new Error(`Missing permission: ${PERMISSIONS.VIEW_WORKFORCE}`);
    }

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const locationId = searchParams.get("locationId");
    const employeeId = searchParams.get("employeeId");

    if (!from || !to) {
      return NextResponse.json(
        { error: "from and to query params are required", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      return NextResponse.json({ error: "Invalid date range", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    const shifts = await db.shift.findMany({
      where: {
        businessId: ctx.business.id,
        ...(locationId ? { locationId } : {}),
        ...(employeeId ? { employeeId } : {}),
        startAt: { lt: toDate },
        endAt: { gt: fromDate },
      },
      include: {
        employee: { select: { id: true, name: true } },
        location: { select: { id: true, name: true, timezone: true } },
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

    const result = await createShift({
      businessId: ctx.business.id,
      createdById: ctx.employee.id,
      data: {
        employeeId: data.employeeId,
        locationId: data.locationId,
        startAt: new Date(data.startAt),
        endAt: new Date(data.endAt),
        notes: data.notes,
        status: data.status,
      },
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error, code: "SHIFT_CREATE_FAILED" }, { status: result.status });
    }

    return NextResponse.json(result.shift, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/workforce/shifts");
  }
}
