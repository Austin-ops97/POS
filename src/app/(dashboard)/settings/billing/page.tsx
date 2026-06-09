import Link from "next/link";
import { ArrowLeft, Crown } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { getStripeSettings } from "@/lib/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function BillingSettingsPage() {
  const ctx = await requireAuth();
  const { subscription } = await getStripeSettings(ctx);

  const plans = [
    { name: "Starter", price: "$29/mo", features: ["1 location", "Basic POS", "Basic reports"] },
    { name: "Pro", price: "$79/mo", features: ["Stripe Terminal", "Advanced inventory", "Employee permissions"], current: subscription?.plan === "PRO" },
    { name: "Multi-Location", price: "$149/mo", features: ["Multiple locations", "Inventory transfers", "Location reporting"] },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/settings"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Billing</h1>
          <p className="text-sm text-slate-500">Manage your NexaPOS subscription</p>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Crown className="h-5 w-5" />Current Plan</CardTitle>
          <CardDescription>
            {subscription?.plan ?? "STARTER"} — <Badge variant="success">{subscription?.status ?? "TRIALING"}</Badge>
          </CardDescription>
        </CardHeader>
        <CardContent><Button variant="outline">Open Billing Portal</Button></CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.name} className={plan.current ? "ring-2 ring-slate-900" : ""}>
            <CardHeader>
              <CardTitle>{plan.name}</CardTitle>
              <p className="text-2xl font-bold">{plan.price}</p>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm text-slate-600">
                {plan.features.map((f) => <li key={f}>• {f}</li>)}
              </ul>
              {!plan.current && <Button className="mt-4 w-full" variant="outline">Upgrade</Button>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
