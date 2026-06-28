import { NextResponse } from "next/server";
import { handleApiError, jsonError } from "@/lib/api-utils";
import { requireAuth, requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { ensurePaidSubscription } from "@/lib/subscription-server";
import {
  ensureReceiptForOrder,
  generateReceiptPdf,
  getReceiptData,
  ReceiptAccessError,
  ReceiptNotFoundError,
} from "@/lib/receipts";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    await ensurePaidSubscription(ctx);
    await requirePermission(ctx, PERMISSIONS.PROCESS_SALE);

    const { id: orderId } = await params;
    await ensureReceiptForOrder(ctx.business.id, orderId);
    const data = await getReceiptData(ctx.business.id, orderId);
    const pdf = await generateReceiptPdf(data);

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="receipt-${data.receiptNumber}.pdf"`,
      },
    });
  } catch (error) {
    if (error instanceof ReceiptAccessError) {
      return jsonError("Order not found", 404);
    }
    if (error instanceof ReceiptNotFoundError) {
      return jsonError(error.message, 404);
    }
    return handleApiError(error, "GET /api/orders/[id]/receipt/pdf");
  }
}
