import { NextResponse } from "next/server";
import { requireAuth, requirePermission } from "@/lib/auth";
import { ensurePaidSubscription } from "@/lib/subscription-server";
import { db } from "@/lib/db";
import { handleApiError } from "@/lib/api-utils";
import { PERMISSIONS } from "@/lib/permissions";
import { getStripeOrThrow, isStripeConfigured } from "@/lib/stripe";

export async function GET() {
  try {
    const ctx = await requireAuth();
    await ensurePaidSubscription(ctx);
    await requirePermission(ctx, PERMISSIONS.MANAGE_STRIPE);

    const stripeAccount = await db.stripeAccount.findUnique({
      where: { businessId: ctx.business.id },
    });

    if (!stripeAccount?.stripeAccountId) {
      return NextResponse.json({
        connected: false,
        status: stripeAccount?.status ?? "NOT_CONNECTED",
        balance: null,
        payouts: [],
        refunds: [],
        disputes: [],
        fees: { total: 0, count: 0 },
        instantPayoutEligible: false,
        upcomingPayout: null,
      });
    }

    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: "Stripe is not configured" },
        { status: 503 }
      );
    }

    const stripe = getStripeOrThrow();
    const accountId = stripeAccount.stripeAccountId;
    const stripeOpts = { stripeAccount: accountId };

    const [account, balance, payouts, refunds, disputes, balanceTransactions] =
      await Promise.all([
        stripe.accounts.retrieve(accountId),
        stripe.balance.retrieve({}, stripeOpts),
        stripe.payouts.list({ limit: 10 }, stripeOpts),
        stripe.refunds.list({ limit: 10 }, stripeOpts),
        stripe.disputes.list({ limit: 10 }, stripeOpts),
        stripe.balanceTransactions.list({ limit: 30 }, stripeOpts),
      ]);

    const available = balance.available.reduce(
      (sum, b) => sum + (b.currency === "usd" ? b.amount : 0),
      0
    );
    const pending = balance.pending.reduce(
      (sum, b) => sum + (b.currency === "usd" ? b.amount : 0),
      0
    );

    let feesTotal = 0;
    let feesCount = 0;
    for (const txn of balanceTransactions.data) {
      if (txn.fee > 0) {
        feesTotal += txn.fee;
        feesCount += 1;
      }
    }

    const upcomingPayout = payouts.data.find(
      (p) => p.status === "pending" || p.status === "in_transit"
    );

    const instantPayoutEligible =
      account.capabilities?.transfers === "active" &&
      account.payouts_enabled &&
      !account.requirements?.disabled_reason;

    let status = stripeAccount.status;
    if (account.requirements?.disabled_reason) {
      status = "RESTRICTED";
    } else if (
      account.charges_enabled &&
      account.payouts_enabled &&
      account.details_submitted
    ) {
      status = "READY";
    } else if (account.details_submitted) {
      status = "CONNECTED";
    } else if (stripeAccount.stripeAccountId) {
      status = "PENDING";
    }

    await db.stripeAccount.update({
      where: { id: stripeAccount.id },
      data: {
        status,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        detailsSubmitted: account.details_submitted,
      },
    });

    return NextResponse.json({
      connected: true,
      status,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      requirements: account.requirements,
      balance: {
        available: available / 100,
        pending: pending / 100,
        currency: "usd",
      },
      payouts: payouts.data.map((p) => ({
        id: p.id,
        amount: p.amount / 100,
        status: p.status,
        arrivalDate: p.arrival_date
          ? new Date(p.arrival_date * 1000).toISOString()
          : null,
        createdAt: new Date(p.created * 1000).toISOString(),
        method: p.method,
      })),
      refunds: refunds.data.map((r) => ({
        id: r.id,
        amount: r.amount / 100,
        status: r.status ?? "succeeded",
        reason: r.reason,
        createdAt: new Date(r.created * 1000).toISOString(),
      })),
      disputes: disputes.data.map((d) => ({
        id: d.id,
        amount: d.amount / 100,
        status: d.status,
        reason: d.reason,
        createdAt: new Date(d.created * 1000).toISOString(),
      })),
      fees: {
        total: feesTotal / 100,
        count: feesCount,
      },
      instantPayoutEligible,
      upcomingPayout: upcomingPayout
        ? {
            id: upcomingPayout.id,
            amount: upcomingPayout.amount / 100,
            status: upcomingPayout.status,
            arrivalDate: upcomingPayout.arrival_date
              ? new Date(upcomingPayout.arrival_date * 1000).toISOString()
              : null,
          }
        : null,
    });
  } catch (error) {
    return handleApiError(error, "GET /api/stripe/dashboard");
  }
}
