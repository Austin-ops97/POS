"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Crown,
  CreditCard,
  AlertTriangle,
  ExternalLink,
  CheckCircle2,
  ShieldAlert,
} from "lucide-react";
import { STRIPE_PLANS } from "@/lib/stripe";
import { getBillingStateInfo } from "@/lib/billing-states";
import type { SubscriptionAccessStatus } from "@/lib/subscription-access";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type SubscriptionInfo = {
  plan: string;
  status: string;
  currentPeriodEnd?: string | null;
  trialEndsAt?: string | null;
  stripeCustomerId?: string | null;
  gracePeriodEndsAt?: string | null;
  trialDaysRemaining?: number | null;
  paymentActionRequiredAt?: string | null;
};

type BillingSettingsProps = {
  subscription: SubscriptionInfo | null;
  access: SubscriptionAccessStatus;
};

const PLAN_KEYS = ["STARTER", "PRO", "MULTI_LOCATION"] as const;
type PlanKey = (typeof PLAN_KEYS)[number];

function formatPlanPrice(cents: number) {
  return `$${(cents / 100).toFixed(0)}/mo`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function statusBadgeVariant(
  variant: "success" | "warning" | "destructive" | "secondary"
): "success" | "warning" | "destructive" | "secondary" {
  return variant;
}

export function BillingSettings({ subscription, access }: BillingSettingsProps) {
  const searchParams = useSearchParams();
  const [portalLoading, setPortalLoading] = useState(false);
  const [upgradingPlan, setUpgradingPlan] = useState<PlanKey | null>(null);

  const currentPlan = subscription?.plan ?? "STARTER";
  const hasStripeCustomer = Boolean(subscription?.stripeCustomerId);
  const stateInfo = getBillingStateInfo(access);

  useEffect(() => {
    if (searchParams.get("checkout") === "success") {
      toast.success("Subscription updated successfully. It may take a moment to reflect.");
    } else if (searchParams.get("checkout") === "canceled") {
      toast.info("Checkout was canceled. No changes were made.");
    }
  }, [searchParams]);

  async function handleOpenPortal() {
    setPortalLoading(true);
    try {
      const returnUrl = `${window.location.origin}/settings/billing`;
      const res = await fetch(
        `/api/stripe/billing?returnUrl=${encodeURIComponent(returnUrl)}`
      );

      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? "Failed to open billing portal");
      }

      const data = (await res.json()) as { url?: string };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      toast.error("Billing portal URL was not returned");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to open billing portal");
    } finally {
      setPortalLoading(false);
    }
  }

  async function handlePlanCheckout(plan: PlanKey) {
    setUpgradingPlan(plan);
    try {
      const baseUrl = `${window.location.origin}/settings/billing`;
      const res = await fetch("/api/stripe/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          successUrl: `${baseUrl}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${baseUrl}?checkout=canceled`,
        }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? "Failed to start checkout");
      }

      const data = (await res.json()) as { url?: string };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      toast.error("Checkout URL was not returned");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start checkout");
    } finally {
      setUpgradingPlan(null);
    }
  }

  const showWarningCard =
    stateInfo.variant === "warning" || stateInfo.variant === "destructive";

  const primaryAction =
    stateInfo.state === "payment_action_required" ||
    stateInfo.state === "past_due_grace" ||
    stateInfo.state === "past_due_expired" ||
    stateInfo.state === "unpaid" ||
    stateInfo.state === "active"
      ? handleOpenPortal
      : () => {
          const firstNonCurrent = PLAN_KEYS.find((k) => k !== currentPlan);
          if (firstNonCurrent) handlePlanCheckout(firstNonCurrent);
        };

  return (
    <>
      <Card
        className={
          showWarningCard
            ? stateInfo.variant === "destructive"
              ? "border-red-200 bg-red-50"
              : "border-amber-200 bg-amber-50"
            : "border-slate-200"
        }
      >
        <CardContent className="flex items-start gap-3 py-4">
          {access.isPaymentActionRequired ? (
            <ShieldAlert className="mt-0.5 h-5 w-5 text-amber-600" />
          ) : (
            <AlertTriangle
              className={`mt-0.5 h-5 w-5 ${
                stateInfo.variant === "destructive" ? "text-red-600" : "text-amber-600"
              }`}
            />
          )}
          <div className="flex-1 text-sm">
            <p className="font-medium text-slate-900">{stateInfo.title}</p>
            <p className="mt-1 text-slate-600">{stateInfo.description}</p>
            <p className="mt-2 text-slate-700">{stateInfo.nextAction}</p>
            <Button
              className="mt-3"
              size="sm"
              variant={showWarningCard ? "default" : "outline"}
              disabled={
                (stateInfo.state === "active" ||
                  stateInfo.state === "payment_action_required" ||
                  stateInfo.state === "past_due_grace" ||
                  stateInfo.state === "past_due_expired" ||
                  stateInfo.state === "unpaid") &&
                (!hasStripeCustomer || portalLoading)
              }
              onClick={primaryAction}
            >
              {portalLoading ? "Opening..." : stateInfo.actionLabel}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5" />
            Current Plan
          </CardTitle>
          <div className="space-y-2 text-sm text-slate-500">
            <div className="flex flex-wrap items-center gap-2">
              <span>
                {STRIPE_PLANS[currentPlan as PlanKey]?.name ?? currentPlan}
              </span>
              <Badge variant={statusBadgeVariant(stateInfo.variant)}>
                {access.status.replace(/_/g, " ")}
              </Badge>
            </div>
            {subscription?.trialEndsAt && access.status === "TRIALING" && !access.isTrialExpired && (
              <p>
                Trial ends {formatDate(subscription.trialEndsAt)}
                {access.trialDaysRemaining != null &&
                  ` (${access.trialDaysRemaining} day${access.trialDaysRemaining === 1 ? "" : "s"} left)`}
              </p>
            )}
            {subscription?.currentPeriodEnd && access.status === "ACTIVE" && (
              <p>Next billing date {formatDate(subscription.currentPeriodEnd)}</p>
            )}
            {access.gracePeriodEndsAt && access.isPastDueInGrace && (
              <p>
                Grace period ends {formatDate(access.gracePeriodEndsAt.toISOString())}
                {access.graceDaysRemaining != null &&
                  ` (${access.graceDaysRemaining} day${access.graceDaysRemaining === 1 ? "" : "s"} left)`}
              </p>
            )}
            {access.isPaymentActionRequired && subscription?.paymentActionRequiredAt && (
              <p>
                Payment action requested{" "}
                {formatDate(subscription.paymentActionRequiredAt)}
              </p>
            )}
            {!hasStripeCustomer && (
              <p>No payment method on file. Choose a plan to add billing details.</p>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            disabled={portalLoading || !hasStripeCustomer}
            onClick={handleOpenPortal}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            {portalLoading ? "Opening..." : "Manage billing"}
          </Button>
          <Button
            variant="outline"
            disabled={!hasStripeCustomer || portalLoading}
            onClick={handleOpenPortal}
          >
            <CreditCard className="mr-2 h-4 w-4" />
            Update payment method
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        {PLAN_KEYS.map((planKey) => {
          const plan = STRIPE_PLANS[planKey];
          const isCurrent = currentPlan === planKey;

          return (
            <Card
              key={planKey}
              className={isCurrent ? "ring-2 ring-slate-900" : ""}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{plan.name}</CardTitle>
                  {isCurrent && (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  )}
                </div>
                <p className="text-2xl font-bold">{formatPlanPrice(plan.price)}</p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm text-slate-600">
                  {plan.features.map((feature) => (
                    <li key={feature}>• {feature}</li>
                  ))}
                </ul>
                {!isCurrent && (
                  <Button
                    className="mt-4 w-full"
                    variant="outline"
                    disabled={upgradingPlan !== null}
                    onClick={() => handlePlanCheckout(planKey)}
                  >
                    {upgradingPlan === planKey ? "Starting checkout..." : "Choose plan"}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
