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
  isLongShift,
  getShiftElapsedHours,
  LONG_SHIFT_HOURS,
} from "@/lib/workforce/timesheet-flags";
import {
  Clock,
  Calendar,
  Palmtree,
  DollarSign,
  Settings,
  ArrowRight,
  ClipboardList,
  AlertTriangle,
} from "lucide-react";

export default async function WorkforcePage() {
  const ctx = await requireAuth();
  const overview = await getWorkforceOverview(ctx);
  const canManage = hasPermission(ctx, PERMISSIONS.MANAGE_WORKFORCE);
  const canApproveTimesheets =
    canManage || hasPermission(ctx, PERMISSIONS.MANAGE_TIME_ENTRIES);
  const canViewSchedule =
    canManage || hasPermission(ctx, PERMISSIONS.VIEW_WORKFORCE);
  const longShiftOpen = overview.clockedIn.filter((entry) => isLongShift(entry));


  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900">Workforce</h1>
          <p className="text-sm text-slate-500">
            Scheduling, attendance, time off, and payroll
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href="/workforce/time-clock">
              <Clock className="h-4 w-4" />
              Time Clock
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href="/workforce/timesheets">
              <ClipboardList className="h-4 w-4" />
              Timesheets
            </Link>
          </Button>
          {canManage && (
            <Button asChild variant="outline" className="col-span-2 w-full sm:col-auto sm:w-auto">
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

      {longShiftOpen.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
            <CardTitle className="flex min-w-0 items-start gap-2 text-base leading-snug text-amber-900 sm:text-lg">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <span>Possible missed clock-outs ({LONG_SHIFT_HOURS}h+)</span>
            </CardTitle>
            <Button asChild variant="ghost" size="sm" className="shrink-0 self-start">
              <Link href="/workforce/timesheets">
                Review <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {longShiftOpen.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{entry.employee.name}</p>
                    <p className="text-xs text-slate-500">
                      Since {formatDate(entry.clockIn)} ·{" "}
                      {getShiftElapsedHours(entry).toFixed(1)}h open
                    </p>
                  </div>
                  <Badge variant="warning" className="w-fit shrink-0">
                    Forgot to clock out?
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {(overview.pendingTimesheetEdits.length > 0) && canApproveTimesheets && (
        <Card>
          <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base sm:text-lg">Pending Timesheet Edits</CardTitle>
            <Button asChild variant="ghost" size="sm" className="self-start sm:self-auto">
              <Link href="/workforce/timesheets">View all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {overview.pendingTimesheetEdits.map((req) => (
                <li key={req.id} className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-slate-900">{req.employee.name}</span>
                  <span className="break-words text-slate-500">{req.reason}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Clock className="h-5 w-5 shrink-0" />
              Currently Clocked In
            </CardTitle>
            <Button asChild variant="ghost" size="sm" className="self-start sm:self-auto">
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
                    className="flex flex-col gap-2 rounded-lg border border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{entry.employee.name}</p>
                      <p className="text-xs text-slate-500">
                        Since {formatDate(entry.clockIn)}
                        {isLongShift(entry)
                          ? ` · ${getShiftElapsedHours(entry).toFixed(1)}h open`
                          : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {isLongShift(entry) && (
                        <Badge variant="warning">12h+ open</Badge>
                      )}
                      <Badge variant="success">
                        {getClockState(entry) === "ON_BREAK" ? "On Break" : "Working"}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Calendar className="h-5 w-5 shrink-0" />
              Today&apos;s Shifts
            </CardTitle>
            {canViewSchedule && (
              <Button asChild variant="ghost" size="sm" className="self-start sm:self-auto">
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
                    className="flex flex-col gap-2 rounded-lg border border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{shift.employee.name}</p>
                      <p className="text-xs text-slate-500">
                        {formatDate(shift.startAt)} – {formatDate(shift.endAt)}
                      </p>
                    </div>
                    {shift.location && (
                      <Badge variant="secondary" className="w-fit">
                        {shift.location.name}
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Link href="/workforce/time-clock" className="min-w-0">
          <Card className="h-full transition-colors hover:bg-slate-50">
            <CardContent className="flex items-center gap-3 pt-5 sm:gap-4 sm:pt-6">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white sm:h-10 sm:w-10">
                <Clock className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">Time Clock</p>
                <p className="truncate text-xs text-slate-500">PIN punch in/out</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/workforce/timesheets" className="min-w-0">
          <Card className="h-full transition-colors hover:bg-slate-50">
            <CardContent className="flex items-center gap-3 pt-5 sm:gap-4 sm:pt-6">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white sm:h-10 sm:w-10">
                <ClipboardList className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">Timesheets</p>
                <p className="truncate text-xs text-slate-500">Edits & flags</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        {canViewSchedule && (
          <Link href="/workforce/schedule" className="min-w-0">
            <Card className="h-full transition-colors hover:bg-slate-50">
              <CardContent className="flex items-center gap-3 pt-5 sm:gap-4 sm:pt-6">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white sm:h-10 sm:w-10">
                  <Calendar className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">Schedule</p>
                  <p className="truncate text-xs text-slate-500">Weekly shift grid</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        )}
        <Link href="/workforce/time-off" className="min-w-0">
          <Card className="h-full transition-colors hover:bg-slate-50">
            <CardContent className="flex items-center gap-3 pt-5 sm:gap-4 sm:pt-6">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white sm:h-10 sm:w-10">
                <Palmtree className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">Time Off</p>
                <p className="truncate text-xs text-slate-500">PTO requests</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        {hasPermission(ctx, PERMISSIONS.VIEW_PAYROLL) && (
          <Link href="/workforce/payroll" className="min-w-0">
            <Card className="h-full transition-colors hover:bg-slate-50">
              <CardContent className="flex items-center gap-3 pt-5 sm:gap-4 sm:pt-6">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white sm:h-10 sm:w-10">
                  <DollarSign className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">Payroll</p>
                  <p className="truncate text-xs text-slate-500">Audit & bonuses</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        )}
      </div>

      {overview.pendingTimeOff.length > 0 && canManage && (
        <Card>
          <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base sm:text-lg">Pending Time Off Requests</CardTitle>
            <Button asChild variant="ghost" size="sm" className="self-start sm:self-auto">
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
