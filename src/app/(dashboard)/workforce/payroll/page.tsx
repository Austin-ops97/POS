import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAuth, hasPermission } from "@/lib/auth";
import { ensureWorkforceSettings } from "@/lib/workforce/settings";
import { getCurrentPayPeriod, getPayPeriods } from "@/lib/workforce/pay-period";
import { PayrollContent } from "@/components/workforce/payroll-content";
import { Button } from "@/components/ui/button";
import { PERMISSIONS } from "@/lib/permissions";

export default async function PayrollPage() {
  const ctx = await requireAuth();

  if (!hasPermission(ctx, PERMISSIONS.VIEW_PAYROLL)) {
    redirect("/workforce");
  }

  const settings = await ensureWorkforceSettings(ctx.business.id);
  const defaultPeriod = getCurrentPayPeriod(
    settings.payPeriodType,
    settings.weekStartDay
  );
  const periods = getPayPeriods(
    settings.payPeriodType,
    settings.weekStartDay,
    6
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/workforce">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Payroll Audit</h1>
          <p className="text-sm text-slate-500">
            Review hours, wages, bonuses, and export for payroll processing
          </p>
        </div>
      </div>
      <PayrollContent periods={periods} defaultPeriod={defaultPeriod} />
    </div>
  );
}
