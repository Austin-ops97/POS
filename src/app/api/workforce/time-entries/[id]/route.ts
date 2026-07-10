import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, hasPermission } from "@/lib/auth";
import { ensurePaidSubscription } from "@/lib/subscription-server";
import { timeEntryAdjustSchema } from "@/lib/validations/workforce";
import { PERMISSIONS } from "@/lib/permissions";
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
    const data = timeEntryAdjustSchema.parse(body);

    const existing = await db.timeEntry.findFirst({
      where: { id, businessId: ctx.business.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Time entry not found" }, { status: 404 });
    }

    const entry = await db.timeEntry.update({
      where: { id },
      data: {
        ...(data.clockIn ? { clockIn: new Date(data.clockIn) } : {}),
        ...(data.clockOut !== undefined
          ? { clockOut: data.clockOut ? new Date(data.clockOut) : null }
          : {}),
        status: data.clockOut ? "COMPLETED" : existing.status === "ACTIVE" ? "ACTIVE" : "ADJUSTED",
        adjustedById: ctx.employee.id,
        adjustmentNote: data.adjustmentNote,
      },
      include: {
        employee: { select: { id: true, name: true } },
        breaks: true,
      },
    });

    await createAuditLog({
      businessId: ctx.business.id,
      employeeId: ctx.employee.id,
      action: "TIME_ENTRY_ADJUSTMENT",
      entity: "TimeEntry",
      entityId: id,
      details: data,
    });

    return NextResponse.json(entry);
  } catch (error) {
    return handleApiError(error, "PATCH /api/workforce/time-entries/[id]");
  }
}
