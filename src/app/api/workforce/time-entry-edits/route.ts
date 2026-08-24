import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hasPermission, requireAuth, requireAnyPermission } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { PERMISSIONS } from "@/lib/permissions";
import { timeEntryEditRequestSchema } from "@/lib/validations/workforce";
import { createAuditLog } from "@/lib/audit";
import { createTimesheetEditRequest } from "@/lib/workforce/timesheet-edit-service";

function canApproveTimesheetEdits(ctx: Awaited<ReturnType<typeof requireAuth>>) {
  return (
    hasPermission(ctx, PERMISSIONS.MANAGE_TIME_ENTRIES) ||
    hasPermission(ctx, PERMISSIONS.MANAGE_WORKFORCE)
  );
}

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    await requireAnyPermission(ctx, [
      PERMISSIONS.VIEW_WORKFORCE,
      PERMISSIONS.MANAGE_TIME_ENTRIES,
      PERMISSIONS.MANAGE_WORKFORCE,
    ]);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const canManageAll = canApproveTimesheetEdits(ctx);

    const requests = await db.timeEntryEditRequest.findMany({
      where: {
        businessId: ctx.business.id,
        ...(status ? { status: status as "PENDING" | "APPROVED" | "DENIED" | "CANCELLED" } : {}),
        ...(canManageAll
          ? {}
          : {
              OR: [
                { employeeId: ctx.employee.id },
                { employee: { managerId: ctx.employee.id } },
              ],
            }),
      },
      include: {
        employee: { select: { id: true, name: true, managerId: true } },
        reviewedBy: { select: { id: true, name: true } },
        timeEntry: {
          select: { id: true, clockIn: true, clockOut: true, status: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json(requests);
  } catch (error) {
    return handleApiError(error, "GET /api/workforce/time-entry-edits");
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    await requireAnyPermission(ctx, [
      PERMISSIONS.VIEW_WORKFORCE,
      PERMISSIONS.MANAGE_TIME_ENTRIES,
      PERMISSIONS.MANAGE_WORKFORCE,
    ]);

    const body = await request.json();
    const data = timeEntryEditRequestSchema.parse(body);

    const entry = await db.timeEntry.findFirst({
      where: { id: data.timeEntryId, businessId: ctx.business.id },
      select: { employeeId: true },
    });

    if (!entry) {
      return NextResponse.json({ error: "Time entry not found" }, { status: 404 });
    }

    const canManage = canApproveTimesheetEdits(ctx);
    if (!canManage && entry.employeeId !== ctx.employee.id) {
      return NextResponse.json(
        { error: "You can only edit your own timesheet entries" },
        { status: 403 }
      );
    }

    // Employees always go through approval. Managers with manage permission
    // still create an edit request so there is an audit trail, unless they
    // use the direct adjust endpoint.
    const editRequest = await createTimesheetEditRequest({
      businessId: ctx.business.id,
      employeeId: entry.employeeId,
      timeEntryId: data.timeEntryId,
      proposal: {
        clockIn: new Date(data.clockIn),
        clockOut: data.clockOut ? new Date(data.clockOut) : null,
        reason: data.reason,
      },
    });

    await createAuditLog({
      businessId: ctx.business.id,
      employeeId: ctx.employee.id,
      action: "TIME_ENTRY_EDIT_REQUESTED",
      entity: "TimeEntryEditRequest",
      entityId: editRequest.id,
      details: data,
    });

    return NextResponse.json(editRequest, { status: 201 });
  } catch (error) {
    if (error instanceof Error && !("status" in error)) {
      const known = [
        "Time entry not found",
        "Clock out before requesting an edit to an open shift",
        "This entry already has a pending edit request",
        "Proposed times must differ from the current entry",
        "Clock out must be after clock in",
        "Edited shift cannot exceed 24 hours",
      ];
      if (known.some((msg) => error.message.includes(msg) || error.message === msg)) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    return handleApiError(error, "POST /api/workforce/time-entry-edits");
  }
}
