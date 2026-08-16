import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { getTaxRates } from "@/lib/queries";
import { TaxRateForm } from "@/components/dashboard/tax-rate-form";
import { Button } from "@/components/ui/button";
import { TaxRatesTable } from "@/components/dashboard/tax-rates-table";

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
      <TaxRatesTable taxRates={taxRates as Array<{ id: string; name: string; rate: unknown; isActive: boolean }>} />
    </div>
  );
}
