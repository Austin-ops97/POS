import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAuth, hasPermission } from "@/lib/auth";
import { TimesheetsPanel } from "@/components/workforce/timesheets-panel";
import { Button } from "@/components/ui/button";
import { PERMISSIONS } from "@/lib/permissions";

export default async function TimesheetsPage() {
  const ctx = await requireAuth();
  const canApprove =
    hasPermission(ctx, PERMISSIONS.MANAGE_TIME_ENTRIES) ||
    hasPermission(ctx, PERMISSIONS.MANAGE_WORKFORCE);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/workforce">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Timesheets</h1>
          <p className="text-sm text-slate-500">
            Review hours, long-shift flags, and approve employee edits
          </p>
        </div>
      </div>
      <TimesheetsPanel canApprove={canApprove} currentEmployeeId={ctx.employee.id} />
    </div>
  );
}
