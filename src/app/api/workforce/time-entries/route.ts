import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hasPermission, requireAuth, requireAnyPermission } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { PERMISSIONS } from "@/lib/permissions";

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    await requireAnyPermission(ctx, [
      PERMISSIONS.VIEW_WORKFORCE,
      PERMISSIONS.MANAGE_TIME_ENTRIES,
      PERMISSIONS.MANAGE_WORKFORCE,
    ]);

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const employeeId = searchParams.get("employeeId");
    const canManage =
      hasPermission(ctx, PERMISSIONS.MANAGE_TIME_ENTRIES) ||
      hasPermission(ctx, PERMISSIONS.MANAGE_WORKFORCE);

    const entries = await db.timeEntry.findMany({
      where: {
        businessId: ctx.business.id,
        // Non-managers can only see their own entries.
        ...(canManage
          ? employeeId
            ? { employeeId }
            : {}
          : { employeeId: ctx.employee.id }),
        ...(from || to
          ? {
              clockIn: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      include: {
        employee: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        breaks: true,
      },
      orderBy: { clockIn: "desc" },
      take: 100,
    });

    return NextResponse.json(entries);
  } catch (error) {
    return handleApiError(error, "GET /api/workforce/time-entries");
  }
}
