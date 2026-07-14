import Link from "next/link";
import {
  Building2,
  MapPin,
  UserCog,
  Percent,
  Package,
  UserCircle,
  CreditCard,
  Receipt,
  Warehouse,
  Shield,
  Puzzle,
  FileText,
  ChevronRight,
  Layers,
  CalendarClock,
} from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const settingsSections = [
  {
    group: "Business",
    items: [
      {
        href: "/settings/business",
        title: "Business",
        description: "Name, contact info, and branding",
        icon: Building2,
      },
      {
        href: "/settings/locations",
        title: "Locations",
        description: "Store addresses, timezones, and tax regions",
        icon: MapPin,
      },
      {
        href: "/settings/modules",
        title: "Industry Modules",
        description: "Retail, service, rental, and feature toggles",
        icon: Layers,
      },
    ],
  },
  {
    group: "People & Catalog",
    items: [
      {
        href: "/employees",
        title: "Employees",
        description: "Staff accounts, roles, and PIN access",
        icon: UserCog,
      },
      {
        href: "/workforce",
        title: "Workforce",
        description: "Scheduling, time clock, PTO, and payroll",
        icon: CalendarClock,
      },
      {
        href: "/settings/roles",
        title: "Roles & Permissions",
        description: "Control who can access what",
        icon: Shield,
      },
      {
        href: "/products",
        title: "Products",
        description: "Catalog, pricing, and categories",
        icon: Package,
      },
      {
        href: "/customers",
        title: "Customers",
        description: "Customer profiles and purchase history",
        icon: UserCircle,
      },
    ],
  },
  {
    group: "Sales & Operations",
    items: [
      {
        href: "/settings/taxes",
        title: "Taxes",
        description: "Tax rates for products and services",
        icon: Percent,
      },
      {
        href: "/settings/receipts",
        title: "Receipts",
        description: "Receipt layout, footer, and printing",
        icon: Receipt,
      },
      {
        href: "/inventory",
        title: "Inventory",
        description: "Stock levels, adjustments, and reorder points",
        icon: Warehouse,
      },
      {
        href: "/payments",
        title: "Payments",
        description: "Stripe Connect, balances, and terminal readers",
        icon: CreditCard,
      },
    ],
  },
  {
    group: "Account",
    items: [
      {
        href: "/settings/integrations",
        title: "Integrations",
        description: "Third-party apps and extensions",
        icon: Puzzle,
      },
      {
        href: "/settings/security",
        title: "Security",
        description: "PIN policies, session timeout, and access",
        icon: Shield,
      },
      {
        href: "/settings/audit-logs",
        title: "Audit Logs",
        description: "Activity history and compliance trail",
        icon: FileText,
      },
    ],
  },
];

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500">
          Your business control center — configure everything in one place
        </p>
      </div>

      {settingsSections.map((section) => (
        <div key={section.group} className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            {section.group}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {section.items.map((item) => (
              <Link key={item.href} href={item.href}>
                <Card className="h-full transition-colors hover:bg-slate-50">
                  <CardHeader className="flex flex-row items-center gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                      <item.icon className="h-5 w-5 text-slate-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base">{item.title}</CardTitle>
                      <CardDescription className="line-clamp-2">
                        {item.description}
                      </CardDescription>
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
