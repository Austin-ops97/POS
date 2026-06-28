"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Crown } from "lucide-react";
import { STRIPE_PLANS } from "@/lib/stripe";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type SubscriptionInfo = {
  plan: string;
  status: string;
  currentPeriodEnd?: string | null;
  trialEndsAt?: string | null;
};

type BillingSettingsProps = {
  demoMode: boolean;
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

export function BillingSettings({ demoMode, subscription }: BillingSettingsProps) {
  const [portalLoading, setPortalLoading] = useState(false);
  const [upgradingPlan, setUpgradingPlan] = useState<PlanKey | null>(null);

  const currentPlan = subscription?.plan ?? "STARTER";

  async function handleOpenPortal() {
    if (demoMode) {
      toast.info("Billing is simulated in demo mode");
      return;
    }

    setPortalLoading(true);
    try {
      const returnUrl = `${window.location.origin}/settings/billing`;
      const res = await fetch(
        `/api/stripe/billing?returnUrl=${encodeURIComponent(returnUrl)}`
      );

      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
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
    if (demoMode) {
      toast.info("Billing is simulated in demo mode");
      return;
    }

    setUpgradingPlan(plan);
    try {
      const baseUrl = `${window.location.origin}/settings/billing`;
      const res = await fetch("/api/stripe/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          successUrl: baseUrl,
          cancelUrl: baseUrl,
        }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
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

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5" />
            Current Plan
          </CardTitle>
          <CardDescription className="space-y-1">
            <span className="block">
              {STRIPE_PLANS[currentPlan as PlanKey]?.name ?? currentPlan} —{" "}
              <Badge variant="success">{subscription?.status ?? "TRIALING"}</Badge>
            </span>
            {subscription?.currentPeriodEnd && (
              <span className="block text-slate-500">
                Current period ends {formatDate(subscription.currentPeriodEnd)}
              </span>
            )}
            {subscription?.trialEndsAt && subscription.status === "TRIALING" && (
              <span className="block text-slate-500">
                Trial ends {formatDate(subscription.trialEndsAt)}
              </span>
            )}
            {demoMode && (
              <span className="block text-slate-500">
                Billing is simulated in demo mode.
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            disabled={portalLoading || demoMode}
            onClick={handleOpenPortal}
          >
            {portalLoading ? "Opening..." : "Open Billing Portal"}
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
                <CardTitle>{plan.name}</CardTitle>
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
                    disabled={upgradingPlan !== null || demoMode}
                    onClick={() => handlePlanCheckout(planKey)}
                  >
                    {upgradingPlan === planKey ? "Starting checkout..." : "Upgrade"}
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
