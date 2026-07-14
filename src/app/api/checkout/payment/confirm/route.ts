import { NextResponse } from "next/server";
import { handleApiError, jsonError } from "@/lib/api-utils";
import { finalizeSuccessfulCardPayment } from "@/lib/card-payment";
import { requireAuth, requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { OrderServiceError } from "@/lib/order-service";
import { PERMISSIONS } from "@/lib/permissions";
import { getStripeOrThrow } from "@/lib/stripe";
import { z } from "zod";

const confirmSchema = z.object({
  orderId: z.string(),
});

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    await requirePermission(ctx, PERMISSIONS.PROCESS_SALE);

    const { orderId } = confirmSchema.parse(await request.json());

    const order = await db.order.findFirst({
      where: {
        id: orderId,
        businessId: ctx.business.id,
      },
      include: {
        payments: {
          where: { method: "CARD" },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!order) {
      return jsonError("Order not found", 404);
    }

    if (order.status === "PAID") {
      return NextResponse.json({
        paid: true,
        orderNumber: order.orderNumber,
      });
    }

    const payment = order.payments[0];
    if (!payment?.stripePaymentIntentId) {
      return jsonError("No card payment found for this order", 400);
    }

    const stripeAccount = await db.stripeAccount.findUnique({
      where: { businessId: ctx.business.id },
    });

    if (!stripeAccount?.stripeAccountId) {
      return jsonError("Stripe Connect account is not configured", 400);
    }

    const stripe = getStripeOrThrow();
    const paymentIntent = await stripe.paymentIntents.retrieve(
      payment.stripePaymentIntentId,
      { expand: ["latest_charge"] },
      { stripeAccount: stripeAccount.stripeAccountId }
    );

    if (paymentIntent.status === "succeeded") {
      const result = await finalizeSuccessfulCardPayment(paymentIntent, "confirm");
      return NextResponse.json({
        paid: true,
        orderNumber: result.orderNumber,
      });
    }

    if (
      paymentIntent.status === "requires_payment_method" ||
      paymentIntent.status === "requires_confirmation" ||
      paymentIntent.status === "requires_action"
    ) {
      return NextResponse.json({
        paid: false,
        status: paymentIntent.status,
      });
    }

    if (paymentIntent.status === "canceled") {
      return jsonError("Payment was canceled", 400);
    }

    return NextResponse.json({
      paid: false,
      status: paymentIntent.status,
    });
  } catch (error) {
    if (error instanceof OrderServiceError) {
      return jsonError(error.message, error.statusCode);
    }
    return handleApiError(error, "POST /api/checkout/payment/confirm");
  }
}
