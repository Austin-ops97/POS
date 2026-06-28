import type { Subscription } from "@prisma/client";
import type { AuthContext } from "./auth";
import { requireAuth } from "./auth";
import { isDemoMode } from "./demo-mode";
import { db } from "./db";
import { captureMonitoringEvent } from "./monitoring";
import {
  AdvancedReportsRequiredError,
  canAccessAdvancedReports,
  canAccessPaidApp,
  getSubscriptionAccessStatus,
  SubscriptionLoadError,
  SubscriptionRequiredError,
  type SubscriptionAccessStatus,
} from "./subscription-access";

export {
  SubscriptionRequiredError,
  SubscriptionLoadError,
  AdvancedReportsRequiredError,
  PlanLimitError,
} from "./subscription-access";

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export async function getSubscriptionForBusiness(
  businessId: string
): Promise<Subscription | null> {
  try {
    return await db.subscription.findUnique({ where: { businessId } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    captureMonitoringEvent({
      type: "subscription_load_fallback",
      businessId,
      error: message,
      environment: process.env.NODE_ENV ?? "unknown",
    });
    return null;
  }
}

export type SubscriptionLoadResult = {
  subscription: Subscription | null;
  access: SubscriptionAccessStatus;
  /** True when the DB query failed (e.g. migration not applied). */
  loadFailed: boolean;
};

/** Dev-only fallback — grants full access when subscription cannot be read. */
function devFullAccessFallback(): SubscriptionAccessStatus {
  return {
    level: "full",
    canAccessPaidApp: true,
    reason: "Subscription status could not be verified (development fallback).",
    status: "TRIALING",
    plan: "STARTER",
    trialEndsAt: null,
    trialDaysRemaining: null,
    isTrialEndingSoon: false,
    isTrialExpired: false,
    gracePeriodEndsAt: null,
    graceDaysRemaining: null,
    isPastDueInGrace: false,
    isPaymentActionRequired: false,
    isSubscriptionLoadFailed: true,
    billingUrl: "/settings/billing",
  };
}

/** Production fallback — billing-only, no paid app access. */
function productionLoadFailedAccess(): SubscriptionAccessStatus {
  return {
    level: "billing_only",
    canAccessPaidApp: false,
    reason:
      "We could not verify your subscription status. Billing and account settings remain available.",
    status: "INCOMPLETE",
    plan: "STARTER",
    trialEndsAt: null,
    trialDaysRemaining: null,
    isTrialEndingSoon: false,
    isTrialExpired: false,
    gracePeriodEndsAt: null,
    graceDaysRemaining: null,
    isPastDueInGrace: false,
    isPaymentActionRequired: false,
    isSubscriptionLoadFailed: true,
    billingUrl: "/settings/billing",
  };
}

function subscriptionLoadFallback(businessId: string, error: unknown): SubscriptionAccessStatus {
  const message = error instanceof Error ? error.message : String(error);
  captureMonitoringEvent({
    type: "subscription_load_fallback",
    businessId,
    error: message,
    environment: process.env.NODE_ENV ?? "unknown",
  });

  if (!isProduction()) {
    return devFullAccessFallback();
  }
  return productionLoadFailedAccess();
}

export async function loadSubscriptionAccess(
  businessId: string
): Promise<SubscriptionLoadResult> {
  try {
    const subscription = await db.subscription.findUnique({
      where: { businessId },
    });
    return {
      subscription,
      access: getSubscriptionAccessStatus(subscription),
      loadFailed: false,
    };
  } catch (error) {
    console.error(
      "[subscription] Failed to load subscription — run `npx prisma migrate deploy` on production:",
      error
    );
    return {
      subscription: null,
      access: subscriptionLoadFallback(businessId, error),
      loadFailed: true,
    };
  }
}

export function requireActiveSubscription(
  subscription: Subscription | null
): SubscriptionAccessStatus {
  if (isDemoMode()) {
    return getSubscriptionAccessStatus(subscription);
  }
  const access = getSubscriptionAccessStatus(subscription);
  if (!canAccessPaidApp(access)) {
    throw new SubscriptionRequiredError(access);
  }
  return access;
}

export async function requireOperationalAccess(): Promise<
  AuthContext & { subscription: Subscription | null; access: SubscriptionAccessStatus }
> {
  const ctx = await requireAuth();
  const subscription = await getSubscriptionForBusiness(ctx.business.id);
  const access = requireActiveSubscription(subscription);
  return { ...ctx, subscription, access };
}

export async function ensurePaidSubscription(
  ctx: AuthContext
): Promise<Subscription | null> {
  if (isDemoMode()) return null;
  const { subscription, access, loadFailed } = await loadSubscriptionAccess(
    ctx.business.id
  );
  if (loadFailed && isProduction()) {
    throw new SubscriptionLoadError(access.reason);
  }
  if (loadFailed) return null;
  if (!canAccessPaidApp(access)) {
    throw new SubscriptionRequiredError(access);
  }
  return subscription;
}

export async function ensureAdvancedReports(
  ctx: AuthContext
): Promise<Subscription | null> {
  const subscription = await ensurePaidSubscription(ctx);
  if (subscription && !canAccessAdvancedReports(subscription.plan)) {
    throw new AdvancedReportsRequiredError();
  }
  return subscription;
}
