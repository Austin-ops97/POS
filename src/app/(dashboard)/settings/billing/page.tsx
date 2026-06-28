import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { getStripeSettings } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { BillingSettings } from "@/components/dashboard/billing-settings";

export default async function BillingSettingsPage() {
  const ctx = await requireAuth();
  const { subscription } = await getStripeSettings(ctx);

  const subscriptionInfo = subscription
    ? {
        plan: String(subscription.plan),
        status: String(subscription.status),
        currentPeriodEnd:
          "currentPeriodEnd" in subscription && subscription.currentPeriodEnd
            ? new Date(subscription.currentPeriodEnd).toISOString()
            : null,
        trialEndsAt:
          "trialEndsAt" in subscription && subscription.trialEndsAt
            ? new Date(subscription.trialEndsAt).toISOString()
            : null,
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
            Manage your NexaPOS subscription
          </p>
        </div>
      </div>

      <BillingSettings subscription={subscriptionInfo} />
    </div>
  );
}
