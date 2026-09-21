import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAuth, hasPermission } from "@/lib/auth";
import { TimesheetsPanel } from "@/components/workforce/timesheets-panel";
import { OvertimeSummary } from "@/components/workforce/overtime-summary";
import { Button } from "@/components/ui/button";
import { PERMISSIONS } from "@/lib/permissions";
import { ensureWorkforceSettings } from "@/lib/workforce/settings";
import { getWeekStart } from "@/lib/workforce/pay-period";
import { formatDateOnly } from "@/lib/workforce/timezone";

export default async function TimesheetsPage({
  searchParams,
}: {
  searchParams: Promise<{ entry?: string }>;
}) {
  const ctx = await requireAuth();
  const params = await searchParams;
  const canApprove =
    hasPermission(ctx, PERMISSIONS.MANAGE_TIME_ENTRIES) ||
    hasPermission(ctx, PERMISSIONS.MANAGE_WORKFORCE);
  const settings = await ensureWorkforceSettings(ctx.business.id);
  const weekStart = getWeekStart(new Date(), settings.weekStartDay);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 sm:items-center sm:gap-4">
        <Link href="/workforce" className="shrink-0">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Timesheets</h1>
          <p className="text-sm text-slate-500">
            Review hours, flags, and correct missed clock-outs
          </p>
        </div>
      </div>
      <OvertimeSummary from={formatDateOnly(weekStart)} to={formatDateOnly(weekEnd)} />
      <TimesheetsPanel
        canApprove={canApprove}
        currentEmployeeId={ctx.employee.id}
        initialEntryId={params.entry}
      />
    </div>
  );
}
