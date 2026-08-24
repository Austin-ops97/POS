import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hasPermission, requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { PERMISSIONS } from "@/lib/permissions";
import { timeEntryEditReviewSchema } from "@/lib/validations/workforce";
import { createAuditLog } from "@/lib/audit";
import { reviewTimesheetEditRequest } from "@/lib/workforce/timesheet-edit-service";

type RouteParams = { params: Promise<{ id: string }> };

function canApproveTimesheetEdits(
  ctx: Awaited<ReturnType<typeof requireAuth>>,
  employeeManagerId: string | null
) {
  if (
    hasPermission(ctx, PERMISSIONS.MANAGE_TIME_ENTRIES) ||
    hasPermission(ctx, PERMISSIONS.MANAGE_WORKFORCE)
  ) {
    return true;
  }
  return employeeManagerId === ctx.employee.id;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const data = timeEntryEditReviewSchema.parse(body);

    const existing = await db.timeEntryEditRequest.findFirst({
      where: { id, businessId: ctx.business.id },
      include: {
        employee: { select: { id: true, managerId: true } },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Edit request not found" }, { status: 404 });
    }

    const isOwner = existing.employeeId === ctx.employee.id;
    const canApprove = canApproveTimesheetEdits(ctx, existing.employee.managerId);

    if (data.status === "CANCELLED") {
      if (!isOwner) {
        return NextResponse.json(
          { error: "Only the requester can cancel this edit" },
          { status: 403 }
        );
      }
    } else if (!canApprove) {
      return NextResponse.json(
        { error: "Not authorized to approve timesheet edits" },
        { status: 403 }
      );
    }

    const updated = await reviewTimesheetEditRequest({
      businessId: ctx.business.id,
      requestId: id,
      reviewerId: ctx.employee.id,
      status: data.status,
      denialReason: data.denialReason,
      isOwner,
    });

    await createAuditLog({
      businessId: ctx.business.id,
      employeeId: ctx.employee.id,
      action: "TIME_ENTRY_EDIT_REVIEW",
      entity: "TimeEntryEditRequest",
      entityId: id,
      details: { status: data.status, denialReason: data.denialReason },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error) {
      const known = [
        "Edit request not found",
        "Request has already been reviewed",
        "Only the requester can cancel this edit",
        "Denial reason is required",
        "Clock out must be after clock in",
        "Edited shift cannot exceed 24 hours",
      ];
      if (known.includes(error.message)) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    return handleApiError(error, "PATCH /api/workforce/time-entry-edits/[id]");
  }
}
