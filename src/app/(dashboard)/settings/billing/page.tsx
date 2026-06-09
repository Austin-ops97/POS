import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { STRIPE_PLANS } from "@/lib/stripe";
import { formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function BillingSettingsPage() {
  const ctx = await requireAuth();

  const subscription = await db.subscription.findUnique({
    where: { businessId: ctx.business.id },
  });

  const currentPlan = subscription?.plan ?? "STARTER";
  const planInfo = STRIPE_PLANS[currentPlan as keyof typeof STRIPE_PLANS];

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
            Manage your subscription and billing
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Current Plan</CardTitle>
              <CardDescription>Your active NexaPOS subscription</CardDescription>
            </div>
            {subscription && (
              <Badge variant={subscription.status === "ACTIVE" ? "success" : "warning"}>
                {subscription.status}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-900">
              {planInfo.name}
            </span>
            {planInfo.price > 0 && (
              <span className="text-slate-500">
                {formatCurrency(planInfo.price / 100)}/month
              </span>
            )}
          </div>
          {subscription?.currentPeriodEnd && (
            <p className="text-sm text-slate-500">
              Current period ends{" "}
              {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
            </p>
          )}
          <Button variant="outline">Open Billing Portal</Button>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-4 text-lg font-semibold text-slate-900">
          Available Plans
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(STRIPE_PLANS).map(([key, plan]) => {
            const isCurrent = key === currentPlan;
            return (
              <Card
                key={key}
                className={isCurrent ? "border-slate-900 ring-1 ring-slate-900" : ""}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{plan.name}</CardTitle>
                    {isCurrent && <Badge>Current</Badge>}
                  </div>
                  <CardDescription>
                    {plan.price > 0
                      ? `${formatCurrency(plan.price / 100)}/mo`
                      : "Custom pricing"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-slate-600">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <Check className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  {!isCurrent && (
                    <Button className="mt-4 w-full" variant="outline" size="sm">
                      Upgrade
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
