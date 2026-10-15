import { NextResponse } from "next/server";
import { handleApiError, jsonError } from "@/lib/api-utils";
import { requireAuth, requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import {
  ensureReceiptForOrder,
  generateReceiptPdf,
  getReceiptData,
  ReceiptAccessError,
  ReceiptNotFoundError,
} from "@/lib/receipts";
import { receiptPdfFilename } from "@/lib/receipts/receipt-filename";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    await requirePermission(ctx, PERMISSIONS.PROCESS_SALE);

    const { id: orderId } = await params;
    await ensureReceiptForOrder(ctx.business.id, orderId);
    const data = await getReceiptData(ctx.business.id, orderId);
    const pdf = await generateReceiptPdf(data);
    const filename = receiptPdfFilename(data.orderNumber);

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
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
