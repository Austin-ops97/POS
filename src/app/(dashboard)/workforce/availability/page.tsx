import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAuth, hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { AvailabilityEditor } from "@/components/workforce/availability-editor";

export const metadata = { title: "Availability" };

export default async function AvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ employee?: string }>;
}) {
  const ctx = await requireAuth();
  const canManage = hasPermission(ctx, PERMISSIONS.MANAGE_WORKFORCE);
  const canView = canManage || hasPermission(ctx, PERMISSIONS.VIEW_WORKFORCE) || hasPermission(ctx, PERMISSIONS.REQUEST_TIME_OFF);
  if (!canView) redirect("/workforce");
  const params = await searchParams;
  const employees = canManage
    ? await db.employeeProfile.findMany({
        where: { businessId: ctx.business.id, deletedAt: null, status: "ACTIVE" },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : null;
  const employeeId = canManage && params.employee ? params.employee : ctx.employee.id;
  const employee = await db.employeeProfile.findFirst({
    where: { id: employeeId, businessId: ctx.business.id, deletedAt: null },
    select: { id: true, maxWeeklyHours: true, preferredWeeklyHours: true },
  });
  if (!employee) redirect(params.employee ? "/workforce/availability" : "/workforce");
  const [windows, exceptions] = await Promise.all([
    db.employeeAvailabilityWindow.findMany({
      where: { businessId: ctx.business.id, employeeId: employee.id },
      orderBy: { weekday: "asc" },
    }),
    db.employeeAvailabilityException.findMany({
      where: { businessId: ctx.business.id, employeeId: employee.id },
      orderBy: { date: "asc" },
    }),
  ]);
  const canEdit =
    canManage ||
    (employee.id === ctx.employee.id &&
      (hasPermission(ctx, PERMISSIONS.VIEW_WORKFORCE) || hasPermission(ctx, PERMISSIONS.REQUEST_TIME_OFF)));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/workforce">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Availability</h1>
          <p className="text-sm text-slate-500">Weekly hours, days off, and short-term exceptions</p>
        </div>
      </div>
      <AvailabilityEditor
        employees={employees}
        initialEmployeeId={employee.id}
        initialWindows={windows.map((window) => ({ weekday: window.weekday, startMinute: window.startMinute, endMinute: window.endMinute }))}
        initialExceptions={exceptions.map((item) => ({
          id: item.id,
          date: item.date.toISOString().slice(0, 10),
          available: item.available,
          startMinute: item.startMinute,
          endMinute: item.endMinute,
          note: item.note,
        }))}
        initialMax={employee.maxWeeklyHours != null ? Number(employee.maxWeeklyHours) : null}
        initialPreferred={employee.preferredWeeklyHours != null ? Number(employee.preferredWeeklyHours) : null}
        canEdit={canEdit}
      />
    </div>
  );
}
