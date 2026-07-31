import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";

export async function GET() {
  try {
    await requirePlatformAdmin();
    const businesses = await db.business.findMany({
      where: { deletedAt: null },
      include: {
        moduleSettings: { select: { module: true, enabled: true } },
        _count: { select: { employees: true, locations: true, orders: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ businesses });
  } catch (error) {
    return handleApiError(error, "GET /api/platform/businesses");
  }
}
