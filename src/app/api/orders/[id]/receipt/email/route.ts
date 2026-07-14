import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, jsonError } from "@/lib/api-utils";
import { requireAuth, requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import {
  ensureReceiptForOrder,
  getReceiptData,
  ReceiptAccessError,
  ReceiptEmailConfigError,
  ReceiptEmailSendError,
  ReceiptNotFoundError,
  sendReceiptEmail,
} from "@/lib/receipts";

const emailSchema = z.object({
  email: z.string().email(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    await requirePermission(ctx, PERMISSIONS.PROCESS_SALE);

    const { id: orderId } = await params;
    const body = await request.json();
    const { email } = emailSchema.parse(body);

    await ensureReceiptForOrder(ctx.business.id, orderId);
    const data = await getReceiptData(ctx.business.id, orderId);

    const result = await sendReceiptEmail({
      businessId: ctx.business.id,
      orderId,
      data,
      to: email,
    });

    return NextResponse.json({
      success: true,
      emailedTo: email,
      messageId: result.id,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError("A valid email address is required", 400);
    }
    if (error instanceof ReceiptAccessError) {
      return jsonError("Order not found", 404);
    }
    if (error instanceof ReceiptNotFoundError) {
      return jsonError(error.message, 404);
    }
    if (error instanceof ReceiptEmailConfigError) {
      return jsonError(error.message, 503);
    }
    if (error instanceof ReceiptEmailSendError) {
      return jsonError(error.message, 502);
    }
    return handleApiError(error, "POST /api/orders/[id]/receipt/email");
  }
}
