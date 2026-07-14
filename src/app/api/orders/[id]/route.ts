import { NextResponse } from "next/server";
import { handleApiError, jsonError } from "@/lib/api-utils";
import { requireAuth, requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import { serializeDecimal } from "@/lib/order-service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await requireAuth();
    await requirePermission(ctx, PERMISSIONS.PROCESS_SALE);

    const order = await db.order.findFirst({
      where: {
        id,
        businessId: ctx.business.id,
      },
      include: {
        location: true,
        customer: true,
        employee: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, type: true } },
            variant: { select: { id: true, name: true } },
            refundItems: {
              include: {
                refund: {
                  select: { id: true, createdAt: true, reason: true },
                },
              },
            },
          },
        },
        payments: {
          orderBy: { createdAt: "asc" },
        },
        refunds: {
          include: {
            employee: { select: { id: true, name: true } },
            items: {
              include: {
                orderItem: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        receipts: {
          orderBy: { createdAt: "desc" },
        },
        appliedDiscounts: true,
      },
    });

    if (!order) {
      return jsonError("Order not found", 404);
    }

    return NextResponse.json({
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        subtotal: serializeDecimal(order.subtotal),
        discountAmount: serializeDecimal(order.discountAmount),
        taxAmount: serializeDecimal(order.taxAmount),
        total: serializeDecimal(order.total),
        notes: order.notes,
        heldAt: order.heldAt,
        paidAt: order.paidAt,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        location: order.location,
        customer: order.customer,
        employee: order.employee,
        items: order.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          variantId: item.variantId,
          name: item.name,
          sku: item.sku,
          quantity: item.quantity,
          unitPrice: serializeDecimal(item.unitPrice),
          discountAmount: serializeDecimal(item.discountAmount),
          taxAmount: serializeDecimal(item.taxAmount),
          total: serializeDecimal(item.total),
          modifiers: item.modifiers,
          notes: item.notes,
          product: item.product,
          variant: item.variant,
          refundedQuantity: item.refundItems.reduce(
            (sum, ri) => sum + ri.quantity,
            0
          ),
        })),
        payments: order.payments.map((payment) => ({
          id: payment.id,
          method: payment.method,
          status: payment.status,
          amount: serializeDecimal(payment.amount),
          stripePaymentIntentId: payment.stripePaymentIntentId,
          stripeChargeId: payment.stripeChargeId,
          cardLast4: payment.cardLast4,
          cardBrand: payment.cardBrand,
          createdAt: payment.createdAt,
        })),
        refunds: order.refunds.map((refund) => ({
          id: refund.id,
          amount: serializeDecimal(refund.amount),
          taxAmount: serializeDecimal(refund.taxAmount),
          reason: refund.reason,
          reasonNote: refund.reasonNote,
          returnToStock: refund.returnToStock,
          stripeRefundId: refund.stripeRefundId,
          employee: refund.employee,
          items: refund.items.map((item) => ({
            id: item.id,
            orderItemId: item.orderItemId,
            orderItemName: item.orderItem.name,
            quantity: item.quantity,
            amount: serializeDecimal(item.amount),
          })),
          createdAt: refund.createdAt,
        })),
        receipts: order.receipts.map((receipt) => ({
          id: receipt.id,
          receiptNumber: receipt.receiptNumber,
          emailedTo: receipt.emailedTo,
          printed: receipt.printed,
          createdAt: receipt.createdAt,
        })),
        appliedDiscounts: order.appliedDiscounts.map((d) => ({
          id: d.id,
          name: d.name,
          type: d.type,
          value: serializeDecimal(d.value),
          amount: serializeDecimal(d.amount),
        })),
      },
    });
  } catch (error) {
    return handleApiError(error, "GET /api/orders/[id]");
  }
}
