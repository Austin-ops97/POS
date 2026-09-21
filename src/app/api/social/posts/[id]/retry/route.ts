import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { retrySocialDelivery } from "@/lib/social/social-service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as { deliveryId?: string } | null;
    if (!body?.deliveryId) throw new Error("Invalid social post: choose a failed platform to retry");
    return NextResponse.json(await retrySocialDelivery(ctx, id, body.deliveryId));
  } catch (error) {
    return handleApiError(error, "POST /api/social/posts/[id]/retry");
  }
}
