import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hasPermission, requireAuth, requireAnyPermission } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { PERMISSIONS } from "@/lib/permissions";
import { collectTimeEntryFlags } from "@/lib/workforce/timesheet-flags";
import { getWorkedMinutes } from "@/lib/workforce/time-clock-service";

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
        employee: { select: { id: true, name: true, managerId: true } },
        location: { select: { id: true, name: true } },
        breaks: true,
        editRequests: {
          where: { status: "PENDING" },
          select: {
            id: true,
            status: true,
            proposedClockIn: true,
            proposedClockOut: true,
            reason: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { clockIn: "desc" },
      take: 100,
    });

    const enriched = entries.map((entry) => {
      const flags = collectTimeEntryFlags(entry);
      const pendingEdit = entry.editRequests[0] ?? null;
      return {
        ...entry,
        editRequests: undefined,
        pendingEdit,
        flags,
        workedHours: Math.round((getWorkedMinutes(entry) / 60) * 100) / 100,
      };
    });

    return NextResponse.json(enriched);
  } catch (error) {
    return handleApiError(error, "GET /api/workforce/time-entries");
  }
}
