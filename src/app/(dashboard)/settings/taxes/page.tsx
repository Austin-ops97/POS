import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Percent } from "lucide-react";

export default async function TaxesSettingsPage() {
  const ctx = await requireAuth();

  const taxRates = await db.taxRate.findMany({
    where: { businessId: ctx.business.id },
    include: { location: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/settings">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Tax Rates</h1>
            <p className="text-sm text-slate-500">
              Configure sales tax for your locations
            </p>
          </div>
        </div>
        <Button>
          <Plus className="h-4 w-4" />
          Add Tax Rate
        </Button>
      </div>

      {taxRates.length === 0 ? (
        <EmptyState
          icon={Percent}
          title="No tax rates configured"
          description="Add tax rates to automatically calculate sales tax on orders."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Active Tax Rates</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Rate</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Location</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Applies To</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {taxRates.map((rate) => (
                  <tr key={rate.id} className="border-b border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-900">{rate.name}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {(Number(rate.rate) * 100).toFixed(2)}%
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {rate.location?.name ?? "All locations"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {rate.appliesToProducts && rate.appliesToServices
                        ? "Products & Services"
                        : rate.appliesToProducts
                          ? "Products"
                          : "Services"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={rate.isActive ? "success" : "secondary"}>
                        {rate.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
