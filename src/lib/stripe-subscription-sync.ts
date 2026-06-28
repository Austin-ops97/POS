import type { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";
import { db } from "./db";
import type Stripe from "stripe";

export type SubscriptionDbClient = Pick<
  typeof db,
  "subscription" | "stripeWebhookEvent"
>;

export function mapStripeSubscriptionStatus(status: string): SubscriptionStatus {
  const map: Record<string, SubscriptionStatus> = {
    active: "ACTIVE",
    trialing: "TRIALING",
    past_due: "PAST_DUE",
    canceled: "CANCELED",
    incomplete: "INCOMPLETE",
    incomplete_expired: "INCOMPLETE",
    unpaid: "UNPAID",
  };
  return map[status] ?? "INCOMPLETE";
}

export function mapStripeSubscriptionPlan(plan: string | undefined): SubscriptionPlan {
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

export function getStripeSubscriptionPeriodEnd(
  subscription: Stripe.Subscription
): Date | undefined {
  const end = subscription.items?.data?.[0]?.current_period_end;
  if (typeof end === "number") {
    return new Date(end * 1000);
  }
  const legacy = (subscription as { current_period_end?: number }).current_period_end;
  return typeof legacy === "number" ? new Date(legacy * 1000) : undefined;
}

export async function syncSubscriptionFromStripe(
  subscription: Stripe.Subscription,
  client: SubscriptionDbClient = db
) {
  const businessId = subscription.metadata?.businessId;
  if (!businessId) return;

  const plan = mapStripeSubscriptionPlan(subscription.metadata?.plan);
  const priceId = subscription.items.data[0]?.price?.id;
  const status = mapStripeSubscriptionStatus(subscription.status);
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;

  const existing = await client.subscription.findUnique({ where: { businessId } });

  const pastDueSince =
    status === "PAST_DUE"
      ? existing?.pastDueSince ?? new Date()
      : status === "ACTIVE" || status === "TRIALING"
        ? null
        : existing?.pastDueSince;

  const clearPaymentAction =
    status === "ACTIVE" || status === "TRIALING";

  await client.subscription.upsert({
    where: { businessId },
    create: {
      businessId,
      plan,
      status,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      currentPeriodEnd: getStripeSubscriptionPeriodEnd(subscription),
      trialEndsAt: subscription.trial_end
        ? new Date(subscription.trial_end * 1000)
        : undefined,
      pastDueSince,
      paymentActionRequiredAt: null,
    },
    update: {
      plan,
      status,
      stripeCustomerId: customerId ?? undefined,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      currentPeriodEnd: getStripeSubscriptionPeriodEnd(subscription),
      trialEndsAt: subscription.trial_end
        ? new Date(subscription.trial_end * 1000)
        : null,
      pastDueSince,
      ...(clearPaymentAction ? { paymentActionRequiredAt: null } : {}),
    },
  });
}

export async function markWebhookEventProcessed(
  eventId: string,
  eventType: string,
  client: SubscriptionDbClient = db
): Promise<boolean> {
  const existing = await client.stripeWebhookEvent.findUnique({
    where: { id: eventId },
  });
  if (existing) return false;

  await client.stripeWebhookEvent.create({
    data: { id: eventId, type: eventType },
  });
  return true;
}

export async function syncSubscriptionFromCheckoutSession(
  session: Stripe.Checkout.Session,
  client: SubscriptionDbClient = db
) {
  const businessId = session.metadata?.businessId;
  if (!businessId) return;

  const plan = mapStripeSubscriptionPlan(session.metadata?.plan);
  const customerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id;

  if (customerId) {
    await client.subscription.upsert({
      where: { businessId },
      create: {
        businessId,
        plan,
        status: "INCOMPLETE",
        stripeCustomerId: customerId,
      },
      update: {
        stripeCustomerId: customerId,
        plan,
      },
    });
  }

  if (session.subscription) {
    const subscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription.id;
    await client.subscription.update({
      where: { businessId },
      data: { stripeSubscriptionId: subscriptionId },
    });
  }
}

export async function handleInvoicePaymentSucceeded(
  invoice: Stripe.Invoice,
  client: SubscriptionDbClient = db
) {
  const customerId =
    typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;

  if (customerId) {
    await client.subscription.updateMany({
      where: {
        stripeCustomerId: customerId,
        status: { in: ["PAST_DUE", "UNPAID"] },
      },
      data: {
        status: "ACTIVE",
        pastDueSince: null,
        paymentActionRequiredAt: null,
      },
    });
  }
}

export async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice,
  client: SubscriptionDbClient = db
) {
  const customerId =
    typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;

  if (!customerId) return;

  const existing = await client.subscription.findFirst({
    where: { stripeCustomerId: customerId },
  });
  if (!existing) return;

  await client.subscription.update({
    where: { id: existing.id },
    data: {
      status: "PAST_DUE",
      pastDueSince: existing.pastDueSince ?? new Date(),
    },
  });
}

export async function handleInvoicePaymentActionRequired(
  invoice: Stripe.Invoice,
  client: SubscriptionDbClient = db
) {
  const customerId =
    typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;

  if (!customerId) return;

  await client.subscription.updateMany({
    where: { stripeCustomerId: customerId },
    data: { paymentActionRequiredAt: new Date() },
  });
}

export async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
  client: SubscriptionDbClient = db
) {
  const businessId = subscription.metadata?.businessId;
  if (!businessId) return;

  await client.subscription.update({
    where: { businessId },
    data: {
      status: "CANCELED",
      stripeSubscriptionId: null,
      pastDueSince: null,
      paymentActionRequiredAt: null,
    },
  });
}
