import { NextResponse } from "next/server";
import { createAuditLog } from "@/lib/audit";
import { getClientIp, handleApiError, jsonError } from "@/lib/api-utils";
import { requireAuth, requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import { getStripeOrThrow, STRIPE_PLANS } from "@/lib/stripe";
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

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    await requirePermission(ctx, PERMISSIONS.MANAGE_BILLING);

    const { searchParams } = new URL(request.url);
    const { returnUrl } = billingGetSchema.parse({
      returnUrl: searchParams.get("returnUrl"),
    });

    const subscription = await db.subscription.findUnique({
      where: { businessId: ctx.business.id },
    });

    if (!subscription?.stripeCustomerId) {
      return jsonError("No billing account found. Subscribe to a plan first.", 400);
    }

    const stripe = getStripeOrThrow();
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: returnUrl,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    return handleApiError(error, "GET /api/stripe/billing");
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    await requirePermission(ctx, PERMISSIONS.MANAGE_BILLING);

    const body = await request.json();
    const { plan, successUrl, cancelUrl } = billingPostSchema.parse(body);

    if (plan === "ENTERPRISE") {
      return jsonError("Enterprise plans require contacting sales", 400);
    }

    const planConfig = STRIPE_PLANS[plan];
    const stripe = getStripeOrThrow();

    let subscription = await db.subscription.findUnique({
      where: { businessId: ctx.business.id },
    });

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
          plan: plan as SubscriptionPlan,
          stripeCustomerId: customerId,
          status: "INCOMPLETE",
        },
        update: {
          stripeCustomerId: customerId,
        },
      });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [
        {
          price: planConfig.priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        businessId: ctx.business.id,
        plan,
      },
      subscription_data: {
        metadata: {
          businessId: ctx.business.id,
          plan,
        },
      },
    });

    await createAuditLog({
      businessId: ctx.business.id,
      employeeId: ctx.employee.id,
      action: "SETTINGS_CHANGE",
      entity: "Subscription",
      entityId: subscription?.id,
      details: { plan, checkoutSessionId: session.id },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({
      url: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    return handleApiError(error, "POST /api/stripe/billing");
  }
}
