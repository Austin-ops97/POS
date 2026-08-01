import { NextResponse } from "next/server";
import { getClientIp, handleApiError } from "@/lib/api-utils";
import { requireAuth } from "@/lib/auth";
import { terminateOrder } from "@/lib/orders/terminate-order";
import { checkRateLimitAsync } from "@/lib/rate-limit";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    const { id: orderId } = await params;

    const rate = await checkRateLimitAsync(
      `order:terminate:${ctx.business.id}:${ctx.employee.id}`,
      30,
      60_000
    );
    if (!rate.ok) {
      return NextResponse.json(
        { error: "Too many requests", code: "RATE_LIMITED" },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const order = await terminateOrder(ctx, orderId, body, getClientIp(request));

    return NextResponse.json({ order });
  } catch (error) {
    return handleApiError(error, "POST /api/orders/[id]/terminate");
  }
}
