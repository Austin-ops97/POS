import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAuth, hasPermission } from "@/lib/auth";
import { TimeOffList } from "@/components/workforce/time-off-list";
import { Button } from "@/components/ui/button";
import { PERMISSIONS } from "@/lib/permissions";

export default async function TimeOffPage() {
  const ctx = await requireAuth();
  const canApprove = hasPermission(ctx, PERMISSIONS.APPROVE_TIME_OFF);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/workforce">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Time Off</h1>
          <p className="text-sm text-slate-500">Request and manage PTO</p>
        </div>
      </div>
      <TimeOffList canApprove={canApprove} currentEmployeeId={ctx.employee.id} />
    </div>
  );
}
