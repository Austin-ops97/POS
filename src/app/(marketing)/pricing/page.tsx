import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const plans = [
  {
    name: "Starter",
    price: 29,
    desc: "Perfect for single-location businesses getting started.",
    features: ["1 location", "Basic POS", "Basic inventory", "Basic reports", "Email support"],
  },
  {
    name: "Pro",
    price: 79,
    desc: "For growing businesses that need more power.",
    features: ["Everything in Starter", "Advanced inventory", "Employee permissions", "Customer profiles", "Advanced reports", "Stripe Terminal"],
    popular: true,
  },
  {
    name: "Multi-Location",
    price: 149,
    desc: "For businesses operating across multiple sites.",
    features: ["Everything in Pro", "Multiple locations", "Inventory transfers", "Location reporting", "Advanced roles"],
  },
  {
    name: "Enterprise",
    price: null,
    desc: "Custom solutions for large organizations.",
    features: ["Custom pricing", "API access", "Priority support", "White-label options", "Dedicated account manager"],
  },
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-slate-900">Pricing</h1>
        <p className="mt-4 text-lg text-slate-600">
          Simple plans that grow with your business. 14-day free trial on all plans.
        </p>
      </div>
      <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => (
          <Card key={plan.name} className={plan.popular ? "border-slate-900 ring-2 ring-slate-900" : ""}>
            <CardHeader>
              {plan.popular && (
                <span className="mb-2 inline-block rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white">
                  Most Popular
                </span>
              )}
              <CardTitle>{plan.name}</CardTitle>
              <p className="text-sm text-slate-500">{plan.desc}</p>
              <p className="text-4xl font-bold">
                {plan.price ? `$${plan.price}` : "Custom"}
                {plan.price && <span className="text-sm font-normal text-slate-500">/mo</span>}
              </p>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-slate-600">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/sign-up" className="mt-6 block">
                <Button className="w-full" variant={plan.popular ? "default" : "outline"}>
                  {plan.price ? "Start Free Trial" : "Contact Sales"}
                </Button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
