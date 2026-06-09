import Link from "next/link";
import {
  CreditCard,
  Receipt,
  Percent,
  Puzzle,
  Building2,
  ChevronRight,
} from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const settingsSections = [
  {
    href: "/settings/payments",
    title: "Payments",
    description: "Stripe Connect, terminal readers, and payment methods",
    icon: CreditCard,
  },
  {
    href: "/settings/billing",
    title: "Billing",
    description: "Subscription plan, invoices, and billing portal",
    icon: Building2,
  },
  {
    href: "/settings/taxes",
    title: "Tax Rates",
    description: "Configure tax rates for products and services",
    icon: Percent,
  },
  {
    href: "/settings/receipts",
    title: "Receipts",
    description: "Receipt layout, footer, and printing options",
    icon: Receipt,
  },
  {
    href: "/settings/modules",
    title: "Modules",
    description: "Enable industry-specific features and modules",
    icon: Puzzle,
  },
];

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500">
          Manage your business configuration
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {settingsSections.map((section) => (
          <Link key={section.href} href={section.href}>
            <Card className="transition-colors hover:bg-slate-50">
              <CardHeader className="flex flex-row items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
                  <section.icon className="h-5 w-5 text-slate-600" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-base">{section.title}</CardTitle>
                  <CardDescription>{section.description}</CardDescription>
                </div>
                <ChevronRight className="h-5 w-5 text-slate-400" />
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
