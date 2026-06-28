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
} from "lucide-react";
import { STRIPE_PLANS } from "@/lib/stripe";
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
};

type BillingSettingsProps = {
  subscription: SubscriptionInfo | null;
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

function statusBadgeVariant(status: string): "success" | "warning" | "destructive" | "secondary" {
  if (status === "ACTIVE" || status === "TRIALING") return "success";
  if (status === "PAST_DUE") return "warning";
  if (status === "CANCELED" || status === "UNPAID") return "destructive";
  return "secondary";
}

export function BillingSettings({ subscription }: BillingSettingsProps) {
  const searchParams = useSearchParams();
  const [portalLoading, setPortalLoading] = useState(false);
  const [upgradingPlan, setUpgradingPlan] = useState<PlanKey | null>(null);

  const currentPlan = subscription?.plan ?? "STARTER";
  const status = subscription?.status ?? "TRIALING";
  const hasStripeCustomer = Boolean(subscription?.stripeCustomerId);

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

  const showPastDueWarning = status === "PAST_DUE";
  const showCanceledWarning = status === "CANCELED" || status === "UNPAID";
  const showTrialExpired =
    status === "TRIALING" &&
    subscription?.trialEndsAt &&
    new Date(subscription.trialEndsAt) <= new Date();

  return (
    <>
      {(showPastDueWarning || showCanceledWarning || showTrialExpired) && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex items-start gap-3 py-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
            <div className="text-sm text-amber-900">
              {showTrialExpired && (
                <p className="font-medium">Your free trial has ended.</p>
              )}
              {showPastDueWarning && (
                <p className="font-medium">Your payment is past due.</p>
              )}
              {showCanceledWarning && (
                <p className="font-medium">Your subscription is not active.</p>
              )}
              <p className="mt-1">
                Choose a plan or update your payment method to restore full access to
                NexaPOS.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

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
                <Badge variant={statusBadgeVariant(status)}>
                  {status.replace(/_/g, " ")}
                </Badge>
              </div>
              {subscription?.trialEndsAt && status === "TRIALING" && !showTrialExpired && (
                <p className="text-slate-500">
                  Trial ends {formatDate(subscription.trialEndsAt)}
                  {subscription.trialDaysRemaining != null &&
                    ` (${subscription.trialDaysRemaining} day${subscription.trialDaysRemaining === 1 ? "" : "s"} left)`}
                </p>
              )}
              {subscription?.currentPeriodEnd && status === "ACTIVE" && (
                <p className="text-slate-500">
                  Next billing date {formatDate(subscription.currentPeriodEnd)}
                </p>
              )}
              {subscription?.gracePeriodEndsAt && status === "PAST_DUE" && (
                <p className="text-slate-500">
                  Grace period ends {formatDate(subscription.gracePeriodEndsAt)}
                </p>
              )}
              {!hasStripeCustomer && (
                <p className="text-slate-500">
                  No payment method on file. Choose a plan to add billing details.
                </p>
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
            disabled={!hasStripeCustomer}
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
