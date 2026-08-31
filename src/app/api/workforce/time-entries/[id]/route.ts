import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, hasPermission } from "@/lib/auth";
import { timeEntryAdjustSchema } from "@/lib/validations/workforce";
import { PERMISSIONS } from "@/lib/permissions";
import { createAuditLog } from "@/lib/audit";
import { handleApiError } from "@/lib/api-utils";
import { managerAdjustTimeEntry } from "@/lib/workforce/timesheet-edit-service";

type RouteParams = { params: Promise<{ id: string }> };

function canManageTime(ctx: Awaited<ReturnType<typeof requireAuth>>) {
  return (
    hasPermission(ctx, PERMISSIONS.MANAGE_WORKFORCE) ||
    hasPermission(ctx, PERMISSIONS.MANAGE_TIME_ENTRIES)
  );
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const ctx = await requireAuth();
    if (!canManageTime(ctx)) {
      throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_TIME_ENTRIES}`);
    }

    const { id } = await params;
    const body = await request.json();
    const data = timeEntryAdjustSchema.parse(body);
    if (!data.clockIn || !data.clockOut) {
      return NextResponse.json(
        { error: "Clock in and clock out are required to correct a shift" },
        { status: 400 }
      );
    }

    const existing = await db.timeEntry.findFirst({
      where: { id, businessId: ctx.business.id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Time entry not found" }, { status: 404 });
    }

    const entry = await managerAdjustTimeEntry({
      businessId: ctx.business.id,
      reviewerId: ctx.employee.id,
      timeEntryId: id,
      clockIn: new Date(data.clockIn),
      clockOut: new Date(data.clockOut),
      adjustmentNote: data.adjustmentNote,
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
    if (error instanceof Error && !("status" in error)) {
      const known = [
        "Time entry not found",
        "Clock out must be after clock in",
        "Clock out is required",
        "Edited shift cannot exceed",
      ];
      if (known.some((msg) => error.message.includes(msg) || error.message === msg)) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    return handleApiError(error, "PATCH /api/workforce/time-entries/[id]");
  }
}
