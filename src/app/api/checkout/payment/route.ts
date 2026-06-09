import { NextResponse } from "next/server";
import { createAuditLog } from "@/lib/audit";
import { getClientIp, handleApiError, jsonError } from "@/lib/api-utils";
import { requireAuth, requirePermission } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo-mode";
import { demoJson, demoOrders } from "@/lib/demo-api";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import { serializeDecimal } from "@/lib/order-service";
import { getStripeOrThrow } from "@/lib/stripe";
import { toDecimal } from "@/lib/order-service";
import { z } from "zod";

const paymentIntentSchema = z.object({
  orderId: z.string(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (isDemoMode()) {
      const order = demoOrders.find((o) => o.id === body.orderId);
      if (order) {
        order.status = "PAID";
        order.paidAt = new Date();
      }
      return demoJson({
        paid: true,
        status: "succeeded",
        orderNumber: order?.orderNumber,
        demo: true,
      });
    }
    const ctx = await requireAuth();
    await requirePermission(ctx, PERMISSIONS.PROCESS_SALE);

    const { orderId } = paymentIntentSchema.parse(body);

    const order = await db.order.findFirst({
      where: {
        id: orderId,
        businessId: ctx.business.id,
      },
      include: {
        payments: {
          where: { status: { in: ["PENDING", "PROCESSING", "REQUIRES_ACTION"] } },
        },
      },
    });

    if (!order) {
      return jsonError("Order not found", 404);
    }

    if (order.status !== "PENDING_PAYMENT") {
      return jsonError(`Order is not pending payment (status: ${order.status})`, 400);
    }

    const stripeAccount = await db.stripeAccount.findUnique({
      where: { businessId: ctx.business.id },
    });

    if (!stripeAccount?.stripeAccountId || stripeAccount.status !== "READY") {
      return jsonError("Stripe Connect account is not ready for payments", 400);
    }

    const stripe = getStripeOrThrow();
    const amountCents = Math.round(Number(order.total) * 100);

    if (amountCents <= 0) {
      return jsonError("Order total must be greater than zero", 400);
    }

    const existingPayment = order.payments.find((p) => p.stripePaymentIntentId);
    if (existingPayment?.stripePaymentIntentId) {
      const existingIntent = await stripe.paymentIntents.retrieve(
        existingPayment.stripePaymentIntentId,
        undefined,
        { stripeAccount: stripeAccount.stripeAccountId }
      );

      return NextResponse.json({
        paymentIntentId: existingIntent.id,
        clientSecret: existingIntent.client_secret,
        amount: serializeDecimal(order.total),
        paymentId: existingPayment.id,
      });
    }

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: "usd",
        metadata: {
          orderId: order.id,
          businessId: ctx.business.id,
          orderNumber: order.orderNumber,
        },
        automatic_payment_methods: { enabled: true },
      },
      { stripeAccount: stripeAccount.stripeAccountId }
    );

    const payment = await db.payment.create({
      data: {
        businessId: ctx.business.id,
        orderId: order.id,
        method: "CARD",
        status: "PENDING",
        amount: toDecimal(Number(order.total)),
        stripePaymentIntentId: paymentIntent.id,
      },
    });

    await createAuditLog({
      businessId: ctx.business.id,
      employeeId: ctx.employee.id,
      action: "PAYMENT",
      entity: "Payment",
      entityId: payment.id,
      details: {
        orderId: order.id,
        paymentIntentId: paymentIntent.id,
        amount: Number(order.total),
      },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      amount: serializeDecimal(order.total),
      paymentId: payment.id,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    return handleApiError(error, "POST /api/checkout/payment");
  }
}
