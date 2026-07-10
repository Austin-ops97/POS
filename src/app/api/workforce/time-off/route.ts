import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, hasPermission } from "@/lib/auth";
import { ensurePaidSubscription } from "@/lib/subscription-server";
import {
  timeOffRequestSchema,
  timeOffReviewSchema,
} from "@/lib/validations/workforce";
import { PERMISSIONS } from "@/lib/permissions";
import {
  calculateHoursRequested,
  parseDateOnly,
} from "@/lib/workforce/pto-service";
import { createAuditLog } from "@/lib/audit";
import { handleApiError } from "@/lib/api-utils";

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    await ensurePaidSubscription(ctx);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const canViewAll =
      hasPermission(ctx, PERMISSIONS.APPROVE_TIME_OFF) ||
      hasPermission(ctx, PERMISSIONS.MANAGE_WORKFORCE);

    const requests = await db.timeOffRequest.findMany({
      where: {
        businessId: ctx.business.id,
        ...(canViewAll ? {} : { employeeId: ctx.employee.id }),
        ...(status ? { status: status as "PENDING" | "APPROVED" | "DENIED" | "CANCELLED" } : {}),
      },
      include: {
        employee: { select: { id: true, name: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(requests);
  } catch (error) {
    return handleApiError(error, "GET /api/workforce/time-off");
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    await ensurePaidSubscription(ctx);

    if (!hasPermission(ctx, PERMISSIONS.REQUEST_TIME_OFF)) {
      throw new Error(`Missing permission: ${PERMISSIONS.REQUEST_TIME_OFF}`);
    }

    const body = await request.json();
    const data = timeOffRequestSchema.parse(body);

    const startDate = parseDateOnly(data.startDate);
    const endDate = parseDateOnly(data.endDate);

    if (endDate < startDate) {
      return NextResponse.json(
        { error: "End date must be on or after start date" },
        { status: 400 }
      );
    }

    const hoursRequested =
      data.hoursRequested ?? calculateHoursRequested(startDate, endDate);

    if (data.type === "PTO") {
      const employee = await db.employeeProfile.findUnique({
        where: { id: ctx.employee.id },
        select: { ptoBalanceHours: true },
      });
      if (employee && Number(employee.ptoBalanceHours) < hoursRequested) {
        return NextResponse.json(
          { error: "Insufficient PTO balance" },
          { status: 400 }
        );
      }
    }

    const timeOff = await db.timeOffRequest.create({
      data: {
        businessId: ctx.business.id,
        employeeId: ctx.employee.id,
        startDate,
        endDate,
        hoursRequested,
        type: data.type,
        notes: data.notes,
      },
      include: {
        employee: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(timeOff, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/workforce/time-off");
  }
}
