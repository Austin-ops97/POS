import type { Subscription } from "@prisma/client";
import type { AuthContext } from "./auth";
import { requireAuth } from "./auth";
import { isDemoMode } from "./demo-mode";
import { db } from "./db";
import {
  canAccessPaidApp,
  getSubscriptionAccessStatus,
  SubscriptionRequiredError,
  type SubscriptionAccessStatus,
} from "./subscription-access";

export {
  SubscriptionRequiredError,
  PlanLimitError,
} from "./subscription-access";

export async function getSubscriptionForBusiness(
  businessId: string
): Promise<Subscription | null> {
  try {
    return await db.subscription.findUnique({ where: { businessId } });
  } catch (error) {
    console.error(
      "[subscription] Failed to load subscription — run `npx prisma migrate deploy` if schema changed:",
      error
    );
    return null;
  }
}

export type SubscriptionLoadResult = {
  subscription: Subscription | null;
  access: SubscriptionAccessStatus;
  /** True when the DB query failed (e.g. migration not applied). */
  loadFailed: boolean;
};

/** Full access fallback when subscription row cannot be read (schema mismatch, DB outage). */
function fullAccessFallback(): SubscriptionAccessStatus {
  return {
    level: "full",
    canAccessPaidApp: true,
    reason: "Subscription status could not be verified.",
    status: "TRIALING",
    plan: "STARTER",
    trialEndsAt: null,
    trialDaysRemaining: null,
    isTrialEndingSoon: false,
    isTrialExpired: false,
    gracePeriodEndsAt: null,
    billingUrl: "/settings/billing",
  };
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
      access: fullAccessFallback(),
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
  if (loadFailed) return null;
  if (!canAccessPaidApp(access)) {
    throw new SubscriptionRequiredError(access);
  }
  return subscription;
}
