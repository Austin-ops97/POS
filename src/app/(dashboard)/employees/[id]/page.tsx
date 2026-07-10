import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { requireAuth, hasPermission } from "@/lib/auth";
import {
  getEmployeeById,
  getEmployeeWorkforceSummary,
} from "@/lib/queries";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getWorkedMinutes } from "@/lib/workforce/time-clock-service";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PERMISSIONS } from "@/lib/permissions";
import { getEmployeeStatusVariant } from "@/lib/status-utils";
import type { EmployeeStatus } from "@prisma/client";

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireAuth();
  const canManage = hasPermission(ctx, PERMISSIONS.MANAGE_EMPLOYEES);

  const employee = await getEmployeeById(ctx, id);
  if (!employee) notFound();

  const summary = await getEmployeeWorkforceSummary(ctx, id);

  const weekHours = summary.timeEntries.reduce((sum, entry) => {
    return sum + getWorkedMinutes(entry) / 60;
  }, 0);

  const hourlyWage = employee.hourlyWage ? Number(employee.hourlyWage) : null;
  const ptoBalance = Number(employee.ptoBalanceHours ?? 0);
  const locations =
  "locations" in employee
    ? (employee.locations as Array<{ location: { name: string } }>).map(
        (l) => l.location.name
      )
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/employees">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{employee.name}</h1>
            <p className="text-sm text-slate-500">{employee.email}</p>
          </div>
        </div>
        {canManage && (
          <Button asChild variant="outline">
            <Link href={`/employees/${id}/edit`}>
              <Pencil className="h-4 w-4" />
              Edit
            </Link>
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Hourly Wage"
          value={hourlyWage != null ? formatCurrency(hourlyWage) : "—"}
        />
        <StatCard title="PTO Balance" value={`${ptoBalance}h`} />
        <StatCard title="Hours This Week" value={`${weekHours.toFixed(1)}h`} />
        <StatCard
          title="Upcoming Shifts"
          value={String(summary.upcomingShifts.length)}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Employment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="font-medium text-slate-900">Role:</span>{" "}
              {employee.role.name}
            </p>
            <p>
              <span className="font-medium text-slate-900">Status:</span>{" "}
              <Badge variant={getEmployeeStatusVariant(employee.status as EmployeeStatus)}>
                {employee.status}
              </Badge>
            </p>
            {employee.phone && (
              <p>
                <span className="font-medium text-slate-900">Phone:</span>{" "}
                {employee.phone}
              </p>
            )}
            {locations.length > 0 && (
              <p>
                <span className="font-medium text-slate-900">Locations:</span>{" "}
                {locations.join(", ")}
              </p>
            )}
            <p>
              <span className="font-medium text-slate-900">Annual PTO:</span>{" "}
              {Number(employee.ptoAnnualHours ?? 0)}h
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Upcoming Shifts</CardTitle>
          </CardHeader>
          <CardContent>
            {summary.upcomingShifts.length === 0 ? (
              <p className="text-sm text-slate-500">No upcoming shifts scheduled</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="pb-2 font-medium">Start</th>
                    <th className="pb-2 font-medium">End</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.upcomingShifts.map((shift) => (
                    <tr key={shift.id} className="border-b border-slate-100">
                      <td className="py-2">{formatDate(shift.startAt)}</td>
                      <td className="py-2">{formatDate(shift.endAt)}</td>
                      <td className="py-2">
                        <Badge variant="secondary">{shift.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Time Entries</CardTitle>
        </CardHeader>
        <CardContent>
          {summary.timeEntries.length === 0 ? (
            <p className="text-sm text-slate-500">No time entries this week</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="pb-2 font-medium">Clock In</th>
                  <th className="pb-2 font-medium">Clock Out</th>
                  <th className="pb-2 font-medium">Hours</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {summary.timeEntries.map((entry) => (
                  <tr key={entry.id} className="border-b border-slate-100">
                    <td className="py-2">{formatDate(entry.clockIn)}</td>
                    <td className="py-2">
                      {entry.clockOut ? formatDate(entry.clockOut) : "—"}
                    </td>
                    <td className="py-2">
                      {(getWorkedMinutes(entry) / 60).toFixed(2)}h
                    </td>
                    <td className="py-2">
                      <Badge variant="secondary">{entry.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
