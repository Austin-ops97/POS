import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAuth, hasPermission } from "@/lib/auth";
import { getEmployees } from "@/lib/queries";
import { db } from "@/lib/db";
import { ensureWorkforceSettings } from "@/lib/workforce/settings";
import { ScheduleCalendar } from "@/components/workforce/schedule-calendar";
import { Button } from "@/components/ui/button";
import { PERMISSIONS } from "@/lib/permissions";

export default async function SchedulePage() {
  const ctx = await requireAuth();

  if (!hasPermission(ctx, PERMISSIONS.MANAGE_WORKFORCE)) {
    redirect("/workforce");
  }

  const [employees, locations, settings] = await Promise.all([
    getEmployees(ctx),
    db.location.findMany({
      where: { businessId: ctx.business.id, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    ensureWorkforceSettings(ctx.business.id),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/workforce">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Schedule</h1>
          <p className="text-sm text-slate-500">Manage weekly employee shifts</p>
        </div>
      </div>
      <ScheduleCalendar
        employees={employees.map((e) => ({ id: e.id, name: e.name }))}
        locations={locations}
        weekStartDay={settings.weekStartDay}
        canManage
      />
    </div>
  );
}
