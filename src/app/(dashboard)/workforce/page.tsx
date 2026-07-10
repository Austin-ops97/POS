import Link from "next/link";
import { requireAuth, hasPermission } from "@/lib/auth";
import { getWorkforceOverview } from "@/lib/queries";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PERMISSIONS } from "@/lib/permissions";
import { formatDate } from "@/lib/utils";
import { getClockState } from "@/lib/workforce/time-clock-service";
import {
  Clock,
  Calendar,
  Palmtree,
  DollarSign,
  Settings,
  ArrowRight,
} from "lucide-react";

export default async function WorkforcePage() {
  const ctx = await requireAuth();
  const overview = await getWorkforceOverview(ctx);
  const canManage = hasPermission(ctx, PERMISSIONS.MANAGE_WORKFORCE);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Workforce</h1>
          <p className="text-sm text-slate-500">
            Scheduling, attendance, time off, and payroll
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/workforce/time-clock">
              <Clock className="h-4 w-4" />
              Time Clock
            </Link>
          </Button>
          {canManage && (
            <Button asChild variant="outline">
              <Link href="/workforce/settings">
                <Settings className="h-4 w-4" />
                Settings
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Active Employees" value={String(overview.activeEmployees)} />
        <StatCard title="Clocked In Now" value={String(overview.clockedIn.length)} />
        <StatCard title="Shifts Today" value={String(overview.todayShifts.length)} />
        <StatCard title="Pending Time Off" value={String(overview.pendingTimeOff.length)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Currently Clocked In
            </CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/workforce/time-clock">
                Open kiosk <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {overview.clockedIn.length === 0 ? (
              <p className="text-sm text-slate-500">No employees clocked in</p>
            ) : (
              <ul className="space-y-3">
                {overview.clockedIn.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between rounded-lg border border-slate-100 px-4 py-3"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{entry.employee.name}</p>
                      <p className="text-xs text-slate-500">
                        Since {formatDate(entry.clockIn)}
                      </p>
                    </div>
                    <Badge variant="success">
                      {getClockState(entry) === "ON_BREAK" ? "On Break" : "Working"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Today&apos;s Shifts
            </CardTitle>
            {canManage && (
              <Button asChild variant="ghost" size="sm">
                <Link href="/workforce/schedule">
                  View schedule <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {overview.todayShifts.length === 0 ? (
              <p className="text-sm text-slate-500">No shifts scheduled today</p>
            ) : (
              <ul className="space-y-3">
                {overview.todayShifts.map((shift) => (
                  <li
                    key={shift.id}
                    className="flex items-center justify-between rounded-lg border border-slate-100 px-4 py-3"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{shift.employee.name}</p>
                      <p className="text-xs text-slate-500">
                        {formatDate(shift.startAt)} – {formatDate(shift.endAt)}
                      </p>
                    </div>
                    {shift.location && (
                      <Badge variant="secondary">{shift.location.name}</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/workforce/time-clock">
          <Card className="h-full transition-colors hover:bg-slate-50">
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">Time Clock</p>
                <p className="text-xs text-slate-500">PIN punch in/out</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        {canManage && (
          <Link href="/workforce/schedule">
            <Card className="h-full transition-colors hover:bg-slate-50">
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white">
                  <Calendar className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">Schedule</p>
                  <p className="text-xs text-slate-500">Weekly shift grid</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        )}
        <Link href="/workforce/time-off">
          <Card className="h-full transition-colors hover:bg-slate-50">
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white">
                <Palmtree className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">Time Off</p>
                <p className="text-xs text-slate-500">PTO requests</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        {hasPermission(ctx, PERMISSIONS.VIEW_PAYROLL) && (
          <Link href="/workforce/payroll">
            <Card className="h-full transition-colors hover:bg-slate-50">
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white">
                  <DollarSign className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">Payroll</p>
                  <p className="text-xs text-slate-500">Audit & bonuses</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        )}
      </div>

      {overview.pendingTimeOff.length > 0 && canManage && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Pending Time Off Requests</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/workforce/time-off">View all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {overview.pendingTimeOff.map((req) => (
                <li
                  key={req.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="font-medium">{req.employee.name}</span>
                  <span className="text-slate-500">
                    {Number(req.hoursRequested)}h — {req.type}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
