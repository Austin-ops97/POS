import Link from "next/link";
import {
  CreditCard,
  Package,
  Users,
  BarChart3,
  MapPin,
  RotateCcw,
  Shield,
  Zap,
  ShoppingCart,
  Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const features = [
  { icon: Zap, title: "Fast checkout", desc: "Large touch-friendly buttons designed for speed." },
  { icon: CreditCard, title: "Stripe Terminal", desc: "Accept card payments with Stripe readers and Tap to Pay." },
  { icon: Package, title: "Inventory management", desc: "Track stock, transfers, and low-stock alerts." },
  { icon: Users, title: "Employee permissions", desc: "Role-based access with PIN login for registers." },
  { icon: ShoppingCart, title: "Customer profiles", desc: "Track purchase history and customer insights." },
  { icon: BarChart3, title: "Sales reporting", desc: "Real-time dashboards and detailed analytics." },
  { icon: MapPin, title: "Multi-location", desc: "Manage multiple stores from one account." },
  { icon: RotateCcw, title: "Refunds & receipts", desc: "Process refunds and send digital receipts." },
];

const industries = [
  { name: "Retail", desc: "Products, SKUs, barcodes, variants, and returns." },
  { name: "Services", desc: "Service items, labor pricing, and staff assignment." },
  { name: "Rentals", desc: "Rental periods, deposits, late fees, and returns." },
  { name: "Restaurant", desc: "Menu items, modifiers, tips, and order notes." },
];

const plans = [
  { name: "Starter", price: "$29", features: ["1 location", "Basic POS", "Basic inventory", "Basic reports"] },
  { name: "Pro", price: "$79", features: ["Advanced inventory", "Employee permissions", "Stripe Terminal", "Advanced reports"], popular: true },
  { name: "Multi-Location", price: "$149", features: ["Multiple locations", "Inventory transfers", "Location reporting", "Advanced roles"] },
  { name: "Enterprise", price: "Custom", features: ["Custom pricing", "API access", "Priority support", "White-label options"] },
];

export default function HomePage() {
  return (
    <>
      <section className="relative overflow-hidden bg-white">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
                A cleaner, smarter POS for modern businesses.
              </h1>
              <p className="mt-6 text-lg text-slate-600">
                Run checkout, inventory, employees, payments, refunds, reports, and customer management from one Stripe-powered platform.
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <Link href="/sign-up">
                  <Button size="lg">Start Free Trial</Button>
                </Link>
                <Link href="/dashboard">
                  <Button variant="outline" size="lg">View Demo</Button>
                </Link>
              </div>
            </div>
            <div className="relative">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 shadow-xl">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-500">Register</span>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">Open</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {["T-Shirt", "Coffee", "Hat", "Charger", "Service", "Rental"].map((item) => (
                    <div key={item} className="rounded-lg border border-slate-200 bg-white p-4 text-center">
                      <div className="mx-auto mb-2 h-10 w-10 rounded-lg bg-slate-100" />
                      <p className="text-xs font-medium text-slate-700">{item}</p>
                      <p className="text-xs text-slate-500">$12.00</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Total</span>
                    <span className="text-lg font-bold text-slate-900">$47.50</span>
                  </div>
                  <Button className="mt-3 w-full" size="lg">Charge Customer</Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-bold text-slate-900">Everything you need to run your business</h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <Card key={f.title} className="border-0 shadow-sm">
                <CardHeader>
                  <f.icon className="h-8 w-8 text-slate-700" />
                  <CardTitle className="text-base">{f.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-500">{f.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-bold text-slate-900">Built for your industry</h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {industries.map((ind) => (
              <Card key={ind.name}>
                <CardHeader>
                  <CardTitle>{ind.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-500">{ind.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-slate-900 py-20 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center text-center">
            <Shield className="h-12 w-12 text-slate-300" />
            <h2 className="mt-6 text-3xl font-bold">Payments secured by Stripe</h2>
            <p className="mt-4 max-w-2xl text-slate-300">
              Card payments are handled entirely by Stripe. NexaPOS never stores raw card data. Supports card readers, Tap to Pay, and online payments with PCI-compliant infrastructure.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-bold text-slate-900">Simple, transparent pricing</h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => (
              <Card key={plan.name} className={plan.popular ? "border-slate-900 ring-2 ring-slate-900" : ""}>
                <CardHeader>
                  <CardTitle>{plan.name}</CardTitle>
                  <p className="text-3xl font-bold">{plan.price}<span className="text-sm font-normal text-slate-500">/mo</span></p>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-sm text-slate-600">
                        <Receipt className="h-4 w-4 text-emerald-500" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link href="/pricing"><Button variant="outline">View all plans</Button></Link>
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-slate-900">
            Build your business around a POS that actually feels simple.
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Start your free trial today. No credit card required.
          </p>
          <Link href="/sign-up" className="mt-8 inline-block">
            <Button size="lg">Start Free Trial</Button>
          </Link>
        </div>
      </section>
    </>
  );
}
