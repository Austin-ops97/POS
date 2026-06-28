import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { getTaxRates } from "@/lib/queries";
import { TaxRateForm } from "@/components/dashboard/tax-rate-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function TaxesSettingsPage() {
  const ctx = await requireAuth();
  const taxRates = await getTaxRates(ctx);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/settings"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tax Rates</h1>
          <p className="text-sm text-slate-500">Configure sales tax for your locations</p>
        </div>
      </div>
      <TaxRateForm locationId={ctx.location?.id} />
      <Card>
        <CardHeader><CardTitle>Active Tax Rates</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="pb-3 font-medium">Name</th>
                <th className="pb-3 font-medium">Rate</th>
                <th className="pb-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {(taxRates as Array<{ id: string; name: string; rate: unknown; isActive: boolean }>).map((tax) => (
                <tr key={tax.id} className="border-b border-slate-100">
                  <td className="py-3 font-medium text-slate-900">{tax.name}</td>
                  <td className="py-3 text-slate-600">{(Number(tax.rate) * 100).toFixed(2)}%</td>
                  <td className="py-3"><Badge variant={tax.isActive ? "success" : "secondary"}>{tax.isActive ? "Active" : "Inactive"}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
