import { NextResponse } from "next/server";
import { requireAuth, hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError } from "@/lib/api-utils";
import { schedulePublishSchema } from "@/lib/validations/workforce";
import { createShift } from "@/lib/workforce/schedule-service";
import { createAuditLog } from "@/lib/audit";

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.MANAGE_WORKFORCE)) {
      throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_WORKFORCE}`);
    }
    const data = schedulePublishSchema.parse(await request.json());
    const created = [];
    const failed = [];
    for (const assignment of data.assignments) {
      const startAt = new Date(assignment.startAt);
      const endAt = new Date(assignment.endAt);
      if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
        failed.push({ employeeId: assignment.employeeId, error: "Invalid date or time" });
        continue;
      }
      const result = await createShift({
        businessId: ctx.business.id,
        createdById: ctx.employee.id,
        data: {
          employeeId: assignment.employeeId,
          locationId: assignment.locationId,
          startAt,
          endAt,
          notes: "Published from schedule suggestions",
          status: "SCHEDULED",
        },
      });
      if (result.ok) created.push(result.shift);
      else failed.push({ employeeId: assignment.employeeId, error: result.error });
    }
    if (created.length > 0) {
      await createAuditLog({
        businessId: ctx.business.id,
        employeeId: ctx.employee.id,
        action: "WORKFORCE_CHANGE",
        entity: "Schedule",
        details: {
          kind: "SCHEDULE_PUBLISHED",
          count: created.length,
          failed: failed.length,
          shiftIds: created.map((shift) => shift.id),
        },
      });
    }
    return NextResponse.json({ created, failed });
  } catch (error) {
    return handleApiError(error, "POST /api/workforce/schedule/publish");
  }
}
