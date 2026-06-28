import { NextResponse } from "next/server";
import { createAuditLog } from "@/lib/audit";
import { getClientIp, handleApiError, jsonError } from "@/lib/api-utils";
import { requireAuth, requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import { getStripeOrThrow, isStripeConfigured } from "@/lib/stripe";
import { z } from "zod";

const connectPostSchema = z.object({
  returnUrl: z.string().url(),
  refreshUrl: z.string().url(),
});

type StripeAccountStatus =
  | "NOT_CONNECTED"
  | "PENDING"
  | "CONNECTED"
  | "RESTRICTED"
  | "READY";

function mapStripeAccountStatus(account: {
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  requirements?: { disabled_reason?: string | null };
}): StripeAccountStatus {
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

export async function GET() {
  try {
    const ctx = await requireAuth();
    await requirePermission(ctx, PERMISSIONS.MANAGE_STRIPE);

    let stripeAccount = await db.stripeAccount.findUnique({
      where: { businessId: ctx.business.id },
    });

    if (!stripeAccount) {
      stripeAccount = await db.stripeAccount.create({
        data: { businessId: ctx.business.id },
      });
    }

    if (!stripeAccount.stripeAccountId) {
      return NextResponse.json({
        status: stripeAccount.status,
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
        connected: false,
      });
    }

    const stripe = getStripeOrThrow();
    const account = await stripe.accounts.retrieve(stripeAccount.stripeAccountId);

    const status = mapStripeAccountStatus(account);

    const updated = await db.stripeAccount.update({
      where: { id: stripeAccount.id },
      data: {
        status,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        detailsSubmitted: account.details_submitted,
      },
    });

    return NextResponse.json({
      status: updated.status,
      chargesEnabled: updated.chargesEnabled,
      payoutsEnabled: updated.payoutsEnabled,
      detailsSubmitted: updated.detailsSubmitted,
      connected: true,
      stripeAccountId: updated.stripeAccountId,
      requirements: account.requirements,
    });
  } catch (error) {
    return handleApiError(error, "GET /api/stripe/connect");
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    await requirePermission(ctx, PERMISSIONS.MANAGE_STRIPE);

    if (!isStripeConfigured()) {
      return jsonError(
        "Stripe is not configured. Set STRIPE_SECRET_KEY in your environment and enable Connect in the Stripe Dashboard.",
        503
      );
    }

    const body = await request.json();
    const { returnUrl, refreshUrl } = connectPostSchema.parse(body);

    const stripe = getStripeOrThrow();

    let stripeAccount = await db.stripeAccount.findUnique({
      where: { businessId: ctx.business.id },
    });

    if (!stripeAccount) {
      stripeAccount = await db.stripeAccount.create({
        data: { businessId: ctx.business.id },
      });
    }

    let accountId = stripeAccount.stripeAccountId;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        email: ctx.business.email || ctx.email,
        metadata: {
          businessId: ctx.business.id,
          businessName: ctx.business.name,
        },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });

      accountId = account.id;

      stripeAccount = await db.stripeAccount.update({
        where: { id: stripeAccount.id },
        data: {
          stripeAccountId: accountId,
          status: "PENDING",
        },
      });
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });

    await createAuditLog({
      businessId: ctx.business.id,
      employeeId: ctx.employee.id,
      action: "SETTINGS_CHANGE",
      entity: "StripeAccount",
      entityId: stripeAccount.id,
      details: { action: "onboarding_link_created" },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({
      url: accountLink.url,
      expiresAt: accountLink.expires_at,
      stripeAccountId: accountId,
    });
  } catch (error) {
    return handleApiError(error, "POST /api/stripe/connect");
  }
}
