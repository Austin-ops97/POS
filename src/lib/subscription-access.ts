import type { Subscription, SubscriptionPlan, SubscriptionStatus } from "@prisma/client";

export const BILLING_URL = "/settings/billing";
export const PAST_DUE_GRACE_DAYS = 7;
export const TRIAL_ENDING_WARNING_DAYS = 7;

export type SubscriptionAccessLevel = "full" | "billing_only";

export type SubscriptionAccessStatus = {
  level: SubscriptionAccessLevel;
  canAccessPaidApp: boolean;
  reason: string;
  status: SubscriptionStatus;
  plan: SubscriptionPlan;
  trialEndsAt: Date | null;
  trialDaysRemaining: number | null;
  isTrialEndingSoon: boolean;
  isTrialExpired: boolean;
  gracePeriodEndsAt: Date | null;
  billingUrl: string;
};

export type PlanEntitlements = {
  maxLocations: number;
  maxEmployees: number;
  advancedReports: boolean;
  terminal: boolean;
};

export const PLAN_ENTITLEMENTS: Record<SubscriptionPlan, PlanEntitlements> = {
  STARTER: {
    maxLocations: 1,
    maxEmployees: 3,
    advancedReports: false,
    terminal: false,
  },
  PRO: {
    maxLocations: 1,
    maxEmployees: 10,
    advancedReports: true,
    terminal: true,
  },
  MULTI_LOCATION: {
    maxLocations: Number.POSITIVE_INFINITY,
    maxEmployees: Number.POSITIVE_INFINITY,
    advancedReports: true,
    terminal: true,
  },
  ENTERPRISE: {
    maxLocations: Number.POSITIVE_INFINITY,
    maxEmployees: Number.POSITIVE_INFINITY,
    advancedReports: true,
    terminal: true,
  },
};

/** Paths accessible when subscription is inactive (billing recovery). */
export const BILLING_EXEMPT_PATH_PREFIXES = [
  "/settings/billing",
  "/settings/business",
  "/settings/security",
  "/settings/payments",
  "/settings/integrations",
  "/settings",
] as const;

export class SubscriptionRequiredError extends Error {
  readonly code = "SUBSCRIPTION_REQUIRED" as const;
  readonly billingUrl: string;
  readonly access: SubscriptionAccessStatus;

  constructor(access: SubscriptionAccessStatus) {
    super(access.reason);
    this.name = "SubscriptionRequiredError";
    this.billingUrl = access.billingUrl;
    this.access = access;
  }
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetween(from: Date, to: Date): number {
  const ms = startOfDay(to).getTime() - startOfDay(from).getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function isBillingExemptPath(pathname: string): boolean {
  return BILLING_EXEMPT_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function getPlanEntitlements(plan: SubscriptionPlan): PlanEntitlements {
  return PLAN_ENTITLEMENTS[plan];
}

export function getSubscriptionAccessStatus(
  subscription: Subscription | null
): SubscriptionAccessStatus {
  const now = new Date();
  const billingUrl = BILLING_URL;

  if (!subscription) {
    return {
      level: "billing_only",
      canAccessPaidApp: false,
      reason: "No subscription found. Choose a plan to continue using NexaPOS.",
      status: "INCOMPLETE",
      plan: "STARTER",
      trialEndsAt: null,
      trialDaysRemaining: null,
      isTrialEndingSoon: false,
      isTrialExpired: true,
      gracePeriodEndsAt: null,
      billingUrl,
    };
  }

  const trialEndsAt = subscription.trialEndsAt;
  const trialDaysRemaining =
    trialEndsAt && trialEndsAt > now ? daysBetween(now, trialEndsAt) : null;
  const isTrialExpired =
    subscription.status === "TRIALING" &&
    (!trialEndsAt || trialEndsAt <= now);
  const isTrialEndingSoon =
    subscription.status === "TRIALING" &&
    trialDaysRemaining !== null &&
    trialDaysRemaining <= TRIAL_ENDING_WARNING_DAYS &&
    trialDaysRemaining > 0;

  const base = {
    status: subscription.status,
    plan: subscription.plan,
    trialEndsAt,
    trialDaysRemaining,
    isTrialEndingSoon,
    isTrialExpired,
    billingUrl,
  };

  if (subscription.status === "ACTIVE") {
    return {
      ...base,
      level: "full",
      canAccessPaidApp: true,
      reason: "Subscription is active.",
      gracePeriodEndsAt: null,
    };
  }

  if (subscription.status === "TRIALING") {
    if (!isTrialExpired) {
      return {
        ...base,
        level: "full",
        canAccessPaidApp: true,
        reason: "Trial is active.",
        gracePeriodEndsAt: null,
      };
    }
    return {
      ...base,
      level: "billing_only",
      canAccessPaidApp: false,
      reason: "Your free trial has ended. Subscribe to continue using NexaPOS.",
      gracePeriodEndsAt: null,
    };
  }

  if (subscription.status === "PAST_DUE") {
    const graceStart = subscription.pastDueSince ?? subscription.currentPeriodEnd ?? subscription.updatedAt;
    const gracePeriodEndsAt = addDays(graceStart, PAST_DUE_GRACE_DAYS);
    if (now <= gracePeriodEndsAt) {
      return {
        ...base,
        level: "full",
        canAccessPaidApp: true,
        reason: "Subscription is past due. Update your payment method to avoid interruption.",
        gracePeriodEndsAt,
      };
    }
    return {
      ...base,
      level: "billing_only",
      canAccessPaidApp: false,
      reason: "Your subscription is past due. Update your payment method to restore access.",
      gracePeriodEndsAt,
    };
  }

  if (subscription.status === "CANCELED") {
    return {
      ...base,
      level: "billing_only",
      canAccessPaidApp: false,
      reason: "Your subscription has been canceled. Choose a plan to restore access.",
      gracePeriodEndsAt: null,
    };
  }

  if (subscription.status === "UNPAID") {
    return {
      ...base,
      level: "billing_only",
      canAccessPaidApp: false,
      reason: "Your subscription is unpaid. Update your payment method to restore access.",
      gracePeriodEndsAt: null,
    };
  }

  // INCOMPLETE
  return {
    ...base,
    level: "billing_only",
    canAccessPaidApp: false,
    reason: "Complete your subscription setup to access NexaPOS.",
    gracePeriodEndsAt: null,
  };
}

export function canAccessPaidApp(access: SubscriptionAccessStatus): boolean {
  return access.canAccessPaidApp;
}

export function canAddEmployee(
  plan: SubscriptionPlan,
  currentCount: number
): boolean {
  const { maxEmployees } = getPlanEntitlements(plan);
  return currentCount < maxEmployees;
}

export function canAddLocation(
  plan: SubscriptionPlan,
  currentCount: number
): boolean {
  const { maxLocations } = getPlanEntitlements(plan);
  return currentCount < maxLocations;
}

export function canUseTerminal(plan: SubscriptionPlan): boolean {
  return getPlanEntitlements(plan).terminal;
}

export function canAccessAdvancedReports(plan: SubscriptionPlan): boolean {
  return getPlanEntitlements(plan).advancedReports;
}

export class PlanLimitError extends Error {
  readonly code = "PLAN_LIMIT_EXCEEDED" as const;

  constructor(message: string) {
    super(message);
    this.name = "PlanLimitError";
  }
}
