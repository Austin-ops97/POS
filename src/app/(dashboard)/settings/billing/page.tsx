import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import type { Subscription } from "@prisma/client";
import { requireAuth } from "@/lib/auth";
import { getStripeSettings } from "@/lib/queries";
import { getSubscriptionAccessStatus } from "@/lib/subscription-access";
import { Button } from "@/components/ui/button";
import { BillingSettings } from "@/components/dashboard/billing-settings";

export default async function BillingSettingsPage() {
  const ctx = await requireAuth();
  const { subscription: dbSubscription } = await getStripeSettings(ctx);
  const access = getSubscriptionAccessStatus(dbSubscription as Subscription | null);

  const sub = dbSubscription as Subscription | null;

  const subscriptionInfo = sub
    ? {
        plan: String(sub.plan),
        status: String(sub.status),
        currentPeriodEnd: sub.currentPeriodEnd
          ? new Date(sub.currentPeriodEnd).toISOString()
          : null,
        trialEndsAt: sub.trialEndsAt
          ? new Date(sub.trialEndsAt).toISOString()
          : null,
        stripeCustomerId: sub.stripeCustomerId,
        gracePeriodEndsAt: access.gracePeriodEndsAt
          ? access.gracePeriodEndsAt.toISOString()
          : null,
        trialDaysRemaining: access.trialDaysRemaining,
      }
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/settings">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Billing</h1>
          <p className="text-sm text-slate-500">
            Manage your NexaPOS subscription and payment method
          </p>
        </div>
      </div>

      <Suspense fallback={null}>
        <BillingSettings subscription={subscriptionInfo} />
      </Suspense>
    </div>
  );
}
