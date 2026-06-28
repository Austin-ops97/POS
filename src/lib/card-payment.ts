import { createAuditLog } from "@/lib/audit";
import { db } from "@/lib/db";
import {
  createReceiptForOrder,
  deductInventoryForOrderInTransaction,
  OrderServiceError,
} from "@/lib/order-service";
import type Stripe from "stripe";

export async function finalizeSuccessfulCardPayment(
  paymentIntent: Stripe.PaymentIntent,
  source: "webhook" | "confirm"
) {
  const orderId = paymentIntent.metadata?.orderId;
  const businessId = paymentIntent.metadata?.businessId;

  if (!orderId || !businessId) {
    throw new OrderServiceError("PaymentIntent is missing order metadata", 400);
  }

  const payment = await db.payment.findFirst({
    where: {
      stripePaymentIntentId: paymentIntent.id,
      businessId,
      orderId,
    },
    include: { order: true },
  });

  if (!payment) {
    throw new OrderServiceError("Payment record not found", 404);
  }

  if (payment.order.status === "FAILED" && payment.status === "FAILED") {
    return { orderNumber: payment.order.orderNumber, alreadyPaid: false };
  }

  if (payment.status === "SUCCEEDED" && payment.order.status === "PAID") {
    return { orderNumber: payment.order.orderNumber, alreadyPaid: true };
  }

  const charge = paymentIntent.latest_charge;
  let chargeId: string | undefined;
  let cardLast4: string | undefined;
  let cardBrand: string | undefined;

  if (typeof charge === "string") {
    chargeId = charge;
  } else if (charge && typeof charge === "object") {
    chargeId = charge.id;
    cardLast4 = charge.payment_method_details?.card?.last4 ?? undefined;
    cardBrand = charge.payment_method_details?.card?.brand ?? undefined;
  }

  await db.$transaction(async (tx) => {
    if (payment.order.status !== "PAID") {
      await deductInventoryForOrderInTransaction(
        tx,
        businessId,
        orderId,
        payment.order.employeeId ?? undefined
      );
    }

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "SUCCEEDED",
        stripeChargeId: chargeId,
        cardLast4,
        cardBrand,
      },
    });

    if (payment.order.status !== "PAID") {
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: "PAID",
          paidAt: new Date(),
          heldAt: null,
        },
      });
    }
  });

  await createReceiptForOrder(businessId, orderId);

  await createAuditLog({
    businessId,
    employeeId: payment.order.employeeId ?? undefined,
    action: "PAYMENT",
    entity: "Order",
    entityId: orderId,
    details: {
      paymentIntentId: paymentIntent.id,
      source,
    },
  });

  return { orderNumber: payment.order.orderNumber, alreadyPaid: false };
}
