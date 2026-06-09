import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const industries = [
  {
    name: "Retail",
    desc: "Sell physical products with SKUs, barcodes, variants, and inventory tracking.",
    features: ["Product catalog", "Barcode scanning", "Variants & options", "Returns & exchanges", "Low-stock alerts"],
  },
  {
    name: "Services",
    desc: "Bill for labor, appointments, and service work with flexible pricing.",
    features: ["Service items", "Labor pricing", "Staff assignment", "Service notes", "Deposits"],
  },
  {
    name: "Rentals",
    desc: "Rent equipment and items with date ranges, deposits, and return tracking.",
    features: ["Rental periods", "Deposits & late fees", "Return status", "Damage fees", "Rental agreements"],
  },
  {
    name: "Restaurant",
    desc: "Foundation for food service with menus, modifiers, tips, and order types.",
    features: ["Menu items", "Modifier groups", "Tip support", "Order notes", "Dine-in / takeout"],
  },
];

export default function IndustriesPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-slate-900">Industries</h1>
        <p className="mt-4 text-lg text-slate-600">
          Modular POS built for retail, services, rentals, and restaurants.
        </p>
      </div>
      <div className="mt-16 grid gap-8 sm:grid-cols-2">
        {industries.map((ind) => (
          <Card key={ind.name}>
            <CardHeader>
              <CardTitle className="text-xl">{ind.name}</CardTitle>
              <p className="text-sm text-slate-500">{ind.desc}</p>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {ind.features.map((f) => (
                  <li key={f} className="text-sm text-slate-600">• {f}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
