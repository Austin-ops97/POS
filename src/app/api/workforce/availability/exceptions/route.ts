import { NextResponse } from "next/server";
import { requireAuth, hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { availabilityExceptionSchema } from "@/lib/validations/workforce";
import { addAvailabilityException, deleteAvailabilityException } from "@/lib/workforce/availability-service";
import { parseDateOnly } from "@/lib/workforce/pto-service";

function canEdit(ctx: Awaited<ReturnType<typeof requireAuth>>, employeeId: string) {
  if (hasPermission(ctx, PERMISSIONS.MANAGE_WORKFORCE)) return true;
  return (
    employeeId === ctx.employee.id &&
    (hasPermission(ctx, PERMISSIONS.VIEW_WORKFORCE) || hasPermission(ctx, PERMISSIONS.REQUEST_TIME_OFF))
  );
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const data = availabilityExceptionSchema.parse(await request.json());
    if (!canEdit(ctx, data.employeeId)) throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_WORKFORCE}`);
    const employee = await db.employeeProfile.findFirst({
      where: { id: data.employeeId, businessId: ctx.business.id, deletedAt: null },
      select: { id: true },
    });
    if (!employee) throw new Error("Employee not found");
    if (data.available && data.startMinute != null && data.endMinute != null && data.endMinute <= data.startMinute) {
      throw new Error("Invalid availability: end time must be after the start time");
    }
    const created = await addAvailabilityException({
      businessId: ctx.business.id,
      employeeId: data.employeeId,
      date: parseDateOnly(data.date),
      available: data.available,
      startMinute: data.available ? data.startMinute : null,
      endMinute: data.available ? data.endMinute : null,
      note: data.note,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/workforce/availability/exceptions");
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await requireAuth();
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get("employeeId") ?? "";
    const exceptionId = searchParams.get("id") ?? "";
    if (!employeeId || !exceptionId) throw new Error("Invalid availability exception");
    if (!canEdit(ctx, employeeId)) throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_WORKFORCE}`);
    const removed = await deleteAvailabilityException({
      businessId: ctx.business.id,
      employeeId,
      exceptionId,
    });
    if (!removed) throw new Error("Availability exception not found");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, "DELETE /api/workforce/availability/exceptions");
  }
}
