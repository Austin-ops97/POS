import { CreditCard, Package, Users, BarChart3, MapPin, RotateCcw, Shield, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const features = [
  { icon: Zap, title: "Fast Checkout", desc: "Tablet-optimized register with barcode scanning, category tabs, and one-tap product selection." },
  { icon: CreditCard, title: "Stripe Terminal", desc: "Accept in-person payments with Stripe readers, Tap to Pay, and PaymentIntents." },
  { icon: Package, title: "Inventory Management", desc: "Track stock levels, transfers between locations, adjustments, and low-stock alerts." },
  { icon: Users, title: "Employee Permissions", desc: "Six role types with granular permissions and PIN-based register login." },
  { icon: BarChart3, title: "Sales Reporting", desc: "Dashboard widgets, charts, and exportable reports for every dimension of your business." },
  { icon: MapPin, title: "Multi-Location", desc: "Manage multiple stores with location-specific inventory, tax rates, and reporting." },
  { icon: RotateCcw, title: "Refunds & Receipts", desc: "Full and partial refunds via Stripe with email, print, and SMS receipt options." },
  { icon: Shield, title: "Security First", desc: "No raw card data stored. Webhook-verified payments. Role-based access control." },
];

export default function FeaturesPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-slate-900">Features</h1>
        <p className="mt-4 text-lg text-slate-600">
          Everything you need to run a modern point of sale.
        </p>
      </div>
      <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <Card key={f.title}>
            <CardHeader>
              <f.icon className="h-8 w-8 text-slate-700" />
              <CardTitle>{f.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-500">{f.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
