import Link from "next/link";
import {
  CheckCircle2,
  ShoppingCart,
  LayoutDashboard,
  Package,
  CreditCard,
  ArrowRight,
} from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { redirect } from "next/navigation";

export default async function OnboardingCompletePage() {
  const ctx = await requireAuth();

  if (!ctx.business.onboardingComplete) {
    redirect("/onboarding");
  }

  const highlights = [
    {
      icon: ShoppingCart,
      title: "Open Register",
      description: "Ring up your first sale — cash works right away.",
      href: "/register",
      cta: "Start selling",
    },
    {
      icon: LayoutDashboard,
      title: "Dashboard",
      description: "Track sales, inventory, and payouts in one place.",
      href: "/dashboard",
      cta: "View dashboard",
    },
    {
      icon: Package,
      title: "Products",
      description: "Add more products, categories, and barcodes.",
      href: "/products",
      cta: "Manage products",
    },
    {
      icon: CreditCard,
      title: "Payments",
      description: "Monitor Stripe balance, payouts, and connection health.",
      href: "/payments",
      cta: "View payments",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-4xl items-center gap-3 px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white">
            N
          </div>
          <span className="text-lg font-semibold text-slate-900">NexaPOS</span>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-16 text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 className="h-12 w-12 text-emerald-600" />
        </div>

        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Your business is ready!
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-lg text-slate-600">
          {ctx.business.name} is set up on NexaPOS. Here&apos;s where to go next.
        </p>

        <div className="mt-10">
          <Link href="/register">
            <Button size="lg" className="gap-2">
              <ShoppingCart className="h-5 w-5" />
              Make your first sale
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        <div className="mt-14 grid gap-4 text-left sm:grid-cols-2">
          {highlights.map((item) => (
            <Card key={item.href} className="transition-shadow hover:shadow-md">
              <CardHeader className="pb-2">
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
                  <item.icon className="h-5 w-5 text-slate-700" />
                </div>
                <CardTitle className="text-base">{item.title}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Link href={item.href}>
                  <Button variant="outline" size="sm">
                    {item.cta}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="mt-12 text-sm text-slate-500">
          Need to change something? Visit{" "}
          <Link href="/settings" className="font-medium text-slate-900 underline">
            Settings
          </Link>{" "}
          anytime.
        </p>
      </div>
    </div>
  );
}
