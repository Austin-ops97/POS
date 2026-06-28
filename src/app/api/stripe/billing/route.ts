import { NextResponse } from "next/server";
import { createAuditLog } from "@/lib/audit";
import { getClientIp, handleApiError, jsonError } from "@/lib/api-utils";
import { requireAuth, requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { captureMonitoringEvent } from "@/lib/monitoring";
import { PERMISSIONS } from "@/lib/permissions";
import { getStripeOrThrow, STRIPE_PLANS, isStripeConfigured } from "@/lib/stripe";
import type Stripe from "stripe";
import { z } from "zod";

type SubscriptionPlan = "STARTER" | "PRO" | "MULTI_LOCATION" | "ENTERPRISE";

const billingPostSchema = z.object({
  plan: z.enum(["STARTER", "PRO", "MULTI_LOCATION", "ENTERPRISE"]),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

const billingGetSchema = z.object({
  returnUrl: z.string().url(),
});

function isPlaceholderPriceId(priceId: string): boolean {
  return priceId === "price_starter" || priceId === "price_pro" || priceId === "price_multi" || priceId === "price_enterprise";
}

function validatePlanPriceId(plan: SubscriptionPlan): string {
  const planConfig = STRIPE_PLANS[plan];
  if (!planConfig.priceId || isPlaceholderPriceId(planConfig.priceId)) {
    throw new Error(
      `Stripe price ID for ${plan} is not configured. Set STRIPE_PRICE_${plan === "MULTI_LOCATION" ? "MULTI" : plan} in your environment.`
    );
  }
  return planConfig.priceId;
}

export async function GET(request: Request) {
  let businessId: string | undefined;
  try {
    const ctx = await requireAuth();
    businessId = ctx.business.id;
    await requirePermission(ctx, PERMISSIONS.MANAGE_BILLING);

    const { searchParams } = new URL(request.url);
    const { returnUrl } = billingGetSchema.parse({
      returnUrl: searchParams.get("returnUrl"),
    });

    const subscription = await db.subscription.findUnique({
      where: { businessId: ctx.business.id },
    });

    if (!subscription?.stripeCustomerId) {
      return jsonError(
        "No billing account found. Subscribe to a plan first to manage billing.",
        400
      );
    }

    if (!isStripeConfigured()) {
      return jsonError("Stripe is not configured", 503);
    }

    const stripe = getStripeOrThrow();
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: returnUrl,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    if (businessId) {
      captureMonitoringEvent({
        type: "billing_portal_failure",
        businessId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return handleApiError(error, "GET /api/stripe/billing");
  }
}

export async function POST(request: Request) {
  let businessId: string | undefined;
  let plan: string | undefined;
  try {
    const ctx = await requireAuth();
    businessId = ctx.business.id;
    await requirePermission(ctx, PERMISSIONS.MANAGE_BILLING);

    if (!isStripeConfigured()) {
      return jsonError("Stripe is not configured", 503);
    }

    const body = await request.json();
    const parsed = billingPostSchema.parse(body);
    const { plan: selectedPlan, successUrl, cancelUrl } = parsed;
    plan = selectedPlan;

    if (selectedPlan === "ENTERPRISE") {
      return jsonError("Enterprise plans require contacting sales", 400);
    }

    const priceId = validatePlanPriceId(selectedPlan);
    const planConfig = STRIPE_PLANS[selectedPlan];
    const stripe = getStripeOrThrow();

    let subscription = await db.subscription.findUnique({
      where: { businessId: ctx.business.id },
    });

    if (subscription && subscription.businessId !== ctx.business.id) {
      return jsonError("Business ownership validation failed", 403);
    }

    let customerId = subscription?.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: ctx.business.email || ctx.email,
        name: ctx.business.name,
        metadata: {
          businessId: ctx.business.id,
        },
      });
      customerId = customer.id;

      subscription = await db.subscription.upsert({
        where: { businessId: ctx.business.id },
        create: {
          businessId: ctx.business.id,
          plan: selectedPlan as SubscriptionPlan,
          stripeCustomerId: customerId,
          status: "INCOMPLETE",
          stripePriceId: priceId,
        },
        update: {
          stripeCustomerId: customerId,
          plan: selectedPlan as SubscriptionPlan,
          stripePriceId: priceId,
        },
      });
    }

    const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
      metadata: {
        businessId: ctx.business.id,
        plan: selectedPlan,
      },
    };

    if (
      subscription?.status === "TRIALING" &&
      subscription.trialEndsAt &&
      subscription.trialEndsAt > new Date()
    ) {
      subscriptionData.trial_end = Math.floor(
        subscription.trialEndsAt.getTime() / 1000
      );
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: ctx.business.id,
      metadata: {
        businessId: ctx.business.id,
        plan: selectedPlan,
      },
      subscription_data: subscriptionData,
    });

    await createAuditLog({
      businessId: ctx.business.id,
      employeeId: ctx.employee.id,
      action: "SETTINGS_CHANGE",
      entity: "Subscription",
      entityId: subscription?.id,
      details: { plan, checkoutSessionId: session.id, priceId: planConfig.priceId },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({
      url: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    if (businessId) {
      captureMonitoringEvent({
        type: "billing_checkout_failure",
        businessId,
        plan,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return handleApiError(error, "POST /api/stripe/billing");
  }
}
