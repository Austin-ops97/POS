import { NextResponse } from "next/server";
import { createAuditLog } from "@/lib/audit";
import { db } from "@/lib/db";
import {
  createReceiptForOrder,
  deductInventoryForOrder,
} from "@/lib/order-service";
import { getStripeOrThrow } from "@/lib/stripe";
type StripeAccountStatus =
  | "NOT_CONNECTED"
  | "PENDING"
  | "CONNECTED"
  | "RESTRICTED"
  | "READY";

type SubscriptionPlan = "STARTER" | "PRO" | "MULTI_LOCATION" | "ENTERPRISE";
type SubscriptionStatus =
  | "ACTIVE"
  | "TRIALING"
  | "PAST_DUE"
  | "CANCELED"
  | "INCOMPLETE";

import type Stripe from "stripe";

export const runtime = "nodejs";

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

function mapSubscriptionStatus(status: string): SubscriptionStatus {
  const map: Record<string, SubscriptionStatus> = {
    active: "ACTIVE",
    trialing: "TRIALING",
    past_due: "PAST_DUE",
    canceled: "CANCELED",
    incomplete: "INCOMPLETE",
    incomplete_expired: "INCOMPLETE",
    unpaid: "PAST_DUE",
  };
  return map[status] ?? "INCOMPLETE";
}

function mapSubscriptionPlan(plan: string | undefined): SubscriptionPlan {
  const valid: SubscriptionPlan[] = [
    "STARTER",
    "PRO",
    "MULTI_LOCATION",
    "ENTERPRISE",
  ];
  if (plan && valid.includes(plan as SubscriptionPlan)) {
    return plan as SubscriptionPlan;
  }
  return "STARTER";
}

function getSubscriptionPeriodEnd(subscription: Stripe.Subscription): Date | undefined {
  const end = (subscription as unknown as { current_period_end?: number }).current_period_end;
  return typeof end === "number" ? new Date(end * 1000) : undefined;
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

  await db.$transaction(async (tx) => {
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

  await deductInventoryForOrder(businessId, orderId, payment.order.employeeId ?? undefined);
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

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const businessId = subscription.metadata?.businessId;
  if (!businessId) return;

  const plan = mapSubscriptionPlan(subscription.metadata?.plan);
  const priceId = subscription.items.data[0]?.price?.id;

  await db.subscription.upsert({
    where: { businessId },
    create: {
      businessId,
      plan,
      status: mapSubscriptionStatus(subscription.status),
      stripeCustomerId:
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      currentPeriodEnd: getSubscriptionPeriodEnd(subscription),
      trialEndsAt: subscription.trial_end
        ? new Date(subscription.trial_end * 1000)
        : undefined,
    },
    update: {
      plan,
      status: mapSubscriptionStatus(subscription.status),
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      currentPeriodEnd: getSubscriptionPeriodEnd(subscription),
      trialEndsAt: subscription.trial_end
        ? new Date(subscription.trial_end * 1000)
        : undefined,
    },
  });
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

  try {
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

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(`Webhook handler error for ${event.type}:`, error);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
