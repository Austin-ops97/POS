import { NextResponse } from "next/server";
import { createAuditLog } from "@/lib/audit";
import { getClientIp, handleApiError, jsonError } from "@/lib/api-utils";
import { requireAuth, requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { toDecimal } from "@/lib/order-service";
import { PERMISSIONS } from "@/lib/permissions";
import {
  returnInventoryForRefund,
  serializeDecimal,
  updateRegisterSessionCashRefunds,
} from "@/lib/order-service";
import { getStripeOrThrow } from "@/lib/stripe";
import { refundSchema } from "@/lib/validations";
import { z } from "zod";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    await requirePermission(ctx, PERMISSIONS.PROCESS_REFUND);

    const { id: orderId } = await params;
    const body = await request.json();
    const parsed = refundSchema.parse({ ...body, orderId });

    const settings = await db.businessSetting.findUnique({
      where: { businessId: ctx.business.id },
    });

    if (settings?.requireManagerRefund && ctx.employee.role.name === "Cashier") {
      return jsonError("Manager approval required for refunds", 403);
    }

    const order = await db.order.findFirst({
      where: {
        id: orderId,
        businessId: ctx.business.id,
      },
      include: {
        items: true,
        payments: {
          where: { status: "SUCCEEDED" },
          orderBy: { createdAt: "desc" },
        },
        refunds: { include: { items: true } },
      },
    });

    if (!order) {
      return jsonError("Order not found", 404);
    }

    if (!["PAID", "PARTIALLY_REFUNDED"].includes(order.status)) {
      return jsonError(`Cannot refund order with status: ${order.status}`, 400);
    }

    const orderTotal = Number(order.total);
    const priorRefunded = order.refunds.reduce(
      (sum, r) => sum + Number(r.amount),
      0
    );
    const remainingRefundable = orderTotal - priorRefunded;

    let refundAmount = 0;
    const refundItems: { orderItemId: string; quantity: number; amount: number }[] =
      [];

    if (parsed.customAmount !== undefined) {
      refundAmount = parsed.customAmount;
    } else if (parsed.items?.length) {
      for (const item of parsed.items) {
        const orderItem = order.items.find((oi) => oi.id === item.orderItemId);
        if (!orderItem) {
          return jsonError(`Order item not found: ${item.orderItemId}`, 404);
        }

        const alreadyRefunded = order.refunds
          .flatMap((r) => r.items)
          .filter((ri) => ri.orderItemId === orderItem.id)
          .reduce((sum, ri) => sum + ri.quantity, 0);

        const availableQty = orderItem.quantity - alreadyRefunded;
        if (item.quantity > availableQty) {
          return jsonError(
            `Cannot refund ${item.quantity} of ${orderItem.name}; only ${availableQty} available`,
            400
          );
        }

        const itemAmount =
          Math.round(
            (Number(orderItem.total) / orderItem.quantity) * item.quantity * 100
          ) / 100;

        refundItems.push({
          orderItemId: orderItem.id,
          quantity: item.quantity,
          amount: itemAmount,
        });
        refundAmount += itemAmount;
      }
      refundAmount = Math.round(refundAmount * 100) / 100;
    } else {
      refundAmount = remainingRefundable;
    }

    if (refundAmount <= 0) {
      return jsonError("Refund amount must be greater than zero", 400);
    }

    if (refundAmount > remainingRefundable + 0.01) {
      return jsonError(
        `Refund amount exceeds remaining refundable balance of ${remainingRefundable.toFixed(2)}`,
        400
      );
    }

    const cardPayment = order.payments.find((p) => p.method === "CARD");
    const cashPayment = order.payments.find((p) => p.method === "CASH");
    let stripeRefundId: string | undefined;

    if (cardPayment?.stripePaymentIntentId || cardPayment?.stripeChargeId) {
      const stripeAccount = await db.stripeAccount.findUnique({
        where: { businessId: ctx.business.id },
      });

      if (!stripeAccount?.stripeAccountId) {
        return jsonError("Stripe account not configured", 400);
      }

      const stripe = getStripeOrThrow();
      const refundParams: {
        amount: number;
        payment_intent?: string;
        charge?: string;
        metadata: Record<string, string>;
      } = {
        amount: Math.round(refundAmount * 100),
        metadata: {
          orderId: order.id,
          businessId: ctx.business.id,
        },
      };

      if (cardPayment.stripePaymentIntentId) {
        refundParams.payment_intent = cardPayment.stripePaymentIntentId;
      } else if (cardPayment.stripeChargeId) {
        refundParams.charge = cardPayment.stripeChargeId;
      }

      const stripeRefund = await stripe.refunds.create(refundParams, {
        stripeAccount: stripeAccount.stripeAccountId,
      });
      stripeRefundId = stripeRefund.id;
    } else if (!cashPayment) {
      return jsonError("No eligible payment found for refund", 400);
    }

    const refund = await db.$transaction(async (tx) => {
      const created = await tx.refund.create({
        data: {
          businessId: ctx.business.id,
          orderId: order.id,
          employeeId: ctx.employee.id,
          amount: toDecimal(refundAmount),
          reason: parsed.reason,
          reasonNote: parsed.reasonNote,
          stripeRefundId,
          returnToStock: parsed.returnToStock,
          items: refundItems.length
            ? {
                create: refundItems.map((item) => ({
                  orderItemId: item.orderItemId,
                  quantity: item.quantity,
                  amount: toDecimal(item.amount),
                })),
              }
            : undefined,
        },
        include: { items: true },
      });

      const newTotalRefunded = priorRefunded + refundAmount;
      const newStatus =
        newTotalRefunded >= orderTotal - 0.01 ? "REFUNDED" : "PARTIALLY_REFUNDED";

      await tx.order.update({
        where: { id: order.id },
        data: { status: newStatus },
      });

      return created;
    });

    if (parsed.returnToStock && refundItems.length > 0) {
      for (const item of refundItems) {
        await returnInventoryForRefund(
          ctx.business.id,
          order.locationId,
          item.orderItemId,
          item.quantity,
          ctx.employee.id,
          refund.id
        );
      }
    }

    if (cashPayment && !cardPayment) {
      await updateRegisterSessionCashRefunds(
        ctx.business.id,
        order.locationId,
        ctx.employee.id,
        refundAmount
      );
    }

    await createAuditLog({
      businessId: ctx.business.id,
      employeeId: ctx.employee.id,
      action: "REFUND",
      entity: "Order",
      entityId: order.id,
      details: {
        refundId: refund.id,
        amount: refundAmount,
        reason: parsed.reason,
        stripeRefundId,
      },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({
      refund: {
        id: refund.id,
        amount: serializeDecimal(refund.amount),
        reason: refund.reason,
        reasonNote: refund.reasonNote,
        returnToStock: refund.returnToStock,
        stripeRefundId: refund.stripeRefundId,
        items: refund.items.map((item) => ({
          id: item.id,
          orderItemId: item.orderItemId,
          quantity: item.quantity,
          amount: serializeDecimal(item.amount),
        })),
        createdAt: refund.createdAt,
      },
      order: {
        id: order.id,
        status:
          priorRefunded + refundAmount >= orderTotal - 0.01
            ? "REFUNDED"
            : "PARTIALLY_REFUNDED",
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    return handleApiError(error, "POST /api/orders/[id]/refund");
  }
}
