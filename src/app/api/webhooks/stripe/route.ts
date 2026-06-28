import { NextResponse } from "next/server";
import { createAuditLog } from "@/lib/audit";
import { db } from "@/lib/db";
import {
  createReceiptForOrder,
  deductInventoryForOrderInTransaction,
  OrderServiceError,
} from "@/lib/order-service";
import {
  handleInvoicePaymentFailed,
  handleInvoicePaymentSucceeded,
  handleSubscriptionDeleted,
  markWebhookEventProcessed,
  syncSubscriptionFromCheckoutSession,
  syncSubscriptionFromStripe,
} from "@/lib/stripe-subscription-sync";
import { getStripeOrThrow } from "@/lib/stripe";
import type { Order, Payment } from "@prisma/client";
import type Stripe from "stripe";

export const runtime = "nodejs";

type StripeAccountStatus =
  | "NOT_CONNECTED"
  | "PENDING"
  | "CONNECTED"
  | "RESTRICTED"
  | "READY";

function mapStripeAccountStatus(account: Stripe.Account): StripeAccountStatus {
  if (account.requirements?.disabled_reason) {
    return "RESTRICTED";
  }
  if (account.charges_enabled && account.payouts_enabled && account.details_submitted) {
    return "READY";
  }
  if (account.details_submitted) {
    return "CONNECTED";
  }
  return "PENDING";
}

type WebhookPayment = Payment & {
  order: Pick<Order, "id" | "status" | "employeeId">;
};

async function handleInventoryFailureOnCardPayment(params: {
  payment: WebhookPayment;
  paymentIntent: Stripe.PaymentIntent;
  businessId: string;
  orderId: string;
  chargeId?: string;
  cardLast4?: string;
  cardBrand?: string;
  errorMessage: string;
}) {
  let stripeRefundId: string | undefined;
  let autoRefundError: string | undefined;

  const stripeAccount = await db.stripeAccount.findUnique({
    where: { businessId: params.businessId },
  });

  if (stripeAccount?.stripeAccountId) {
    try {
      const stripe = getStripeOrThrow();
      const refund = await stripe.refunds.create(
        {
          payment_intent: params.paymentIntent.id,
          metadata: {
            orderId: params.orderId,
            businessId: params.businessId,
            reason: "inventory_unavailable",
          },
        },
        { stripeAccount: stripeAccount.stripeAccountId }
      );
      stripeRefundId = refund.id;
    } catch (err) {
      autoRefundError = err instanceof Error ? err.message : "Auto-refund failed";
      console.error("Auto-refund failed after inventory failure:", err);
    }
  } else {
    autoRefundError = "Stripe Connect account not configured";
  }

  await db.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: params.payment.id },
      data: {
        status: "FAILED",
        stripeChargeId: params.chargeId,
        cardLast4: params.cardLast4,
        cardBrand: params.cardBrand,
      },
    });

    await tx.order.update({
      where: { id: params.orderId },
      data: { status: "FAILED" },
    });

    if (stripeRefundId) {
      await tx.refund.create({
        data: {
          businessId: params.businessId,
          orderId: params.orderId,
          amount: params.payment.amount,
          reason: "OTHER",
          reasonNote: `Auto-refund after inventory failure: ${params.errorMessage}`,
          stripeRefundId,
        },
      });
    }
  });

  await createAuditLog({
    businessId: params.businessId,
    employeeId: params.payment.order.employeeId ?? undefined,
    action: "PAYMENT",
    entity: "Order",
    entityId: params.orderId,
    details: {
      paymentIntentId: params.paymentIntent.id,
      source: "webhook",
      outcome: "inventory_failure",
      inventoryError: params.errorMessage,
      autoRefundId: stripeRefundId,
      autoRefundError,
      requiresManualReview: !stripeRefundId,
    },
  });
}

async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  const orderId = paymentIntent.metadata?.orderId;
  const businessId = paymentIntent.metadata?.businessId;

  if (!orderId || !businessId) {
    console.warn("PaymentIntent missing metadata:", paymentIntent.id);
    return;
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
    console.warn("Payment record not found for PaymentIntent:", paymentIntent.id);
    return;
  }

  if (payment.order.status === "FAILED" && payment.status === "FAILED") {
    return;
  }

  if (payment.status === "SUCCEEDED" && payment.order.status === "PAID") {
    return;
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

  try {
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
        source: "webhook",
      },
    });
  } catch (error) {
    if (error instanceof OrderServiceError) {
      await handleInventoryFailureOnCardPayment({
        payment,
        paymentIntent,
        businessId,
        orderId,
        chargeId,
        cardLast4,
        cardBrand,
        errorMessage: error.message,
      });
      return;
    }
    throw error;
  }
}

async function handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
  const orderId = paymentIntent.metadata?.orderId;
  const businessId = paymentIntent.metadata?.businessId;

  if (!orderId || !businessId) return;

  const payment = await db.payment.findFirst({
    where: {
      stripePaymentIntentId: paymentIntent.id,
      businessId,
    },
  });

  if (!payment) return;

  await db.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED" },
    });

    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (order && order.status === "PENDING_PAYMENT") {
      await tx.order.update({
        where: { id: orderId },
        data: { status: "FAILED" },
      });
    }
  });

  await createAuditLog({
    businessId,
    action: "PAYMENT",
    entity: "Payment",
    entityId: payment.id,
    details: {
      paymentIntentId: paymentIntent.id,
      status: "FAILED",
      source: "webhook",
    },
  });
}

async function handleChargeRefunded(charge: Stripe.Charge) {
  const paymentIntentId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id;

  if (!paymentIntentId) return;

  const payment = await db.payment.findFirst({
    where: { stripePaymentIntentId: paymentIntentId },
    include: { order: { include: { refunds: true } } },
  });

  if (!payment) return;

  const businessId = payment.businessId;
  const order = payment.order;
  const orderTotal = Number(order.total);
  const totalRefunded = charge.amount_refunded / 100;

  const newStatus =
    totalRefunded >= orderTotal - 0.01 ? "REFUNDED" : "PARTIALLY_REFUNDED";

  if (order.status !== newStatus) {
    await db.order.update({
      where: { id: order.id },
      data: { status: newStatus },
    });
  }

  const existingRefund = order.refunds.find(
    (r) => r.stripeRefundId && charge.refunds?.data?.some((sr) => sr.id === r.stripeRefundId)
  );

  if (!existingRefund && charge.refunds?.data?.length) {
    const latestStripeRefund = charge.refunds.data[charge.refunds.data.length - 1];
    await db.refund.create({
      data: {
        businessId,
        orderId: order.id,
        amount: latestStripeRefund.amount / 100,
        reason: "OTHER",
        reasonNote: "Processed via Stripe webhook",
        stripeRefundId: latestStripeRefund.id,
      },
    });
  }

  await createAuditLog({
    businessId,
    action: "REFUND",
    entity: "Order",
    entityId: order.id,
    details: {
      chargeId: charge.id,
      amountRefunded: totalRefunded,
      source: "webhook",
    },
  });
}

async function handleAccountUpdated(account: Stripe.Account) {
  const businessId = account.metadata?.businessId;
  if (!businessId) return;

  const stripeAccount = await db.stripeAccount.findUnique({
    where: { businessId },
  });

  if (!stripeAccount) return;

  await db.stripeAccount.update({
    where: { id: stripeAccount.id },
    data: {
      stripeAccountId: account.id,
      status: mapStripeAccountStatus(account),
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
    },
  });
}

const BILLING_WEBHOOK_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "invoice.payment_action_required",
]);

const CONNECT_WEBHOOK_EVENTS = new Set([
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "charge.refunded",
  "account.updated",
]);

async function dispatchWebhookEvent(event: Stripe.Event) {
  switch (event.type) {
    case "payment_intent.succeeded":
      await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
      break;
    case "payment_intent.payment_failed":
      await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
      break;
    case "charge.refunded":
      await handleChargeRefunded(event.data.object as Stripe.Charge);
      break;
    case "account.updated":
      await handleAccountUpdated(event.data.object as Stripe.Account);
      break;
    case "checkout.session.completed":
      await syncSubscriptionFromCheckoutSession(
        event.data.object as Stripe.Checkout.Session
      );
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await syncSubscriptionFromStripe(event.data.object as Stripe.Subscription);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      break;
    case "invoice.payment_succeeded":
      await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
      break;
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
      break;
    case "invoice.payment_action_required":
      console.info(
        "Invoice payment action required:",
        (event.data.object as Stripe.Invoice).id
      );
      break;
    default:
      break;
  }
}

export async function POST(request: Request) {
  const stripe = getStripeOrThrow();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not configured");
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    console.error("Webhook signature verification failed:", message);
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 });
  }

  const isBilling = BILLING_WEBHOOK_EVENTS.has(event.type);
  const isConnect = CONNECT_WEBHOOK_EVENTS.has(event.type);

  if (!isBilling && !isConnect) {
    return NextResponse.json({ received: true, skipped: true });
  }

  const shouldProcess = await markWebhookEventProcessed(event.id, event.type);
  if (!shouldProcess) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    await dispatchWebhookEvent(event);
    return NextResponse.json({ received: true });
  } catch (error) {
    await db.stripeWebhookEvent.delete({ where: { id: event.id } }).catch(() => undefined);
    console.error(`Webhook handler error for ${event.type} (${event.id}):`, error);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
