import { NextResponse } from "next/server";
import { requireAuth, hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { availabilitySaveSchema } from "@/lib/validations/workforce";
import { replaceAvailability } from "@/lib/workforce/availability-service";
import { createAuditLog } from "@/lib/audit";

function canView(ctx: Awaited<ReturnType<typeof requireAuth>>, employeeId: string) {
  return (
    employeeId === ctx.employee.id ||
    hasPermission(ctx, PERMISSIONS.VIEW_WORKFORCE) ||
    hasPermission(ctx, PERMISSIONS.MANAGE_WORKFORCE)
  );
}

function canEdit(ctx: Awaited<ReturnType<typeof requireAuth>>, employeeId: string) {
  if (hasPermission(ctx, PERMISSIONS.MANAGE_WORKFORCE)) return true;
  return (
    employeeId === ctx.employee.id &&
    (hasPermission(ctx, PERMISSIONS.VIEW_WORKFORCE) || hasPermission(ctx, PERMISSIONS.REQUEST_TIME_OFF))
  );
}

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const employeeId = new URL(request.url).searchParams.get("employeeId") ?? ctx.employee.id;
    if (!canView(ctx, employeeId)) throw new Error(`Missing permission: ${PERMISSIONS.VIEW_WORKFORCE}`);
    const employee = await db.employeeProfile.findFirst({
      where: { id: employeeId, businessId: ctx.business.id, deletedAt: null },
      select: { id: true, name: true, maxWeeklyHours: true, preferredWeeklyHours: true },
    });
    if (!employee) throw new Error("Employee not found");
    const [windows, exceptions] = await Promise.all([
      db.employeeAvailabilityWindow.findMany({
        where: { businessId: ctx.business.id, employeeId },
        orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
      }),
      db.employeeAvailabilityException.findMany({
        where: { businessId: ctx.business.id, employeeId },
        orderBy: { date: "asc" },
      }),
    ]);
    return NextResponse.json({
      employee: {
        ...employee,
        maxWeeklyHours: employee.maxWeeklyHours != null ? Number(employee.maxWeeklyHours) : null,
        preferredWeeklyHours: employee.preferredWeeklyHours != null ? Number(employee.preferredWeeklyHours) : null,
      },
      windows,
      exceptions,
      canEdit: canEdit(ctx, employeeId),
    });
  } catch (error) {
    return handleApiError(error, "GET /api/workforce/availability");
  }
}

export async function PUT(request: Request) {
  try {
    const ctx = await requireAuth();
    const data = availabilitySaveSchema.parse(await request.json());
    if (!canEdit(ctx, data.employeeId)) throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_WORKFORCE}`);
    const employee = await db.employeeProfile.findFirst({
      where: { id: data.employeeId, businessId: ctx.business.id, deletedAt: null },
      select: { id: true },
    });
    if (!employee) throw new Error("Employee not found");
    for (const window of data.windows) {
      if (window.endMinute <= window.startMinute) throw new Error("Invalid availability: end time must be after the start time");
    }
    if (
      data.maxWeeklyHours != null &&
      data.preferredWeeklyHours != null &&
      data.preferredWeeklyHours > data.maxWeeklyHours
    ) {
      throw new Error("Invalid availability: preferred hours cannot exceed max hours");
    }
    await replaceAvailability({
      businessId: ctx.business.id,
      employeeId: data.employeeId,
      maxWeeklyHours: data.maxWeeklyHours,
      preferredWeeklyHours: data.preferredWeeklyHours,
      windows: data.windows,
    });
    await createAuditLog({
      businessId: ctx.business.id,
      employeeId: ctx.employee.id,
      action: "WORKFORCE_CHANGE",
      entity: "EmployeeAvailability",
      entityId: data.employeeId,
      details: { windows: data.windows.length, maxWeeklyHours: data.maxWeeklyHours },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, "PUT /api/workforce/availability");
  }
}
