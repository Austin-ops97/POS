import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAuth, hasPermission } from "@/lib/auth";
import { ensureWorkforceSettings } from "@/lib/workforce/settings";
import { WorkforceSettingsForm } from "@/components/workforce/workforce-settings-form";
import { Button } from "@/components/ui/button";
import { PERMISSIONS } from "@/lib/permissions";

export default async function WorkforceSettingsPage() {
  const ctx = await requireAuth();

  if (!hasPermission(ctx, PERMISSIONS.MANAGE_WORKFORCE)) {
    redirect("/workforce");
  }

  const settings = await ensureWorkforceSettings(ctx.business.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/workforce">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Workforce Settings</h1>
          <p className="text-sm text-slate-500">
            Pay periods, overtime rules, and PTO defaults
          </p>
        </div>
      </div>
      <WorkforceSettingsForm
        defaultValues={{
          payPeriodType: settings.payPeriodType,
          weekStartDay: settings.weekStartDay,
          overtimeThresholdHours: Number(settings.overtimeThresholdHours),
          defaultPtoAnnualHours: Number(settings.defaultPtoAnnualHours),
        }}
      />
    </div>
  );
}
