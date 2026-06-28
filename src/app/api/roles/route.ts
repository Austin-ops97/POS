import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { ensurePaidSubscription } from "@/lib/subscription-server";
import { db } from "@/lib/db";
import { handleApiError } from "@/lib/api-utils";

export async function GET() {
  try {
    const ctx = await requireAuth();
    await ensurePaidSubscription(ctx);

    const roles = await db.role.findMany({
      where: { isSystem: true },
      select: { id: true, name: true, description: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(roles);
  } catch (error) {
    return handleApiError(error, "GET /api/roles");
  }
}
