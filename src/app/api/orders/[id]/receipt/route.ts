import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-utils";
import { requireAuth, requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { ensurePaidSubscription } from "@/lib/subscription-server";
import {
  ensureReceiptForOrder,
  getReceiptData,
  markReceiptPrinted,
  ReceiptAccessError,
  ReceiptNotFoundError,
  renderReceiptHtml,
} from "@/lib/receipts";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    await ensurePaidSubscription(ctx);
    await requirePermission(ctx, PERMISSIONS.PROCESS_SALE);

    const { id: orderId } = await params;
    await ensureReceiptForOrder(ctx.business.id, orderId);
    const data = await getReceiptData(ctx.business.id, orderId);

    const format = request.nextUrl.searchParams.get("format") ?? "json";

    if (format === "html") {
      return new NextResponse(renderReceiptHtml(data), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    return NextResponse.json({ receipt: data });
  } catch (error) {
    if (error instanceof ReceiptAccessError) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    if (error instanceof ReceiptNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return handleApiError(error, "GET /api/orders/[id]/receipt");
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    await ensurePaidSubscription(ctx);
    await requirePermission(ctx, PERMISSIONS.PROCESS_SALE);

    const { id: orderId } = await params;
    await markReceiptPrinted(ctx.business.id, orderId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "POST /api/orders/[id]/receipt");
  }
}
