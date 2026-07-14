import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const employeeId = searchParams.get("employeeId");

    const entries = await db.timeEntry.findMany({
      where: {
        businessId: ctx.business.id,
        ...(employeeId ? { employeeId } : {}),
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
