"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { ChevronLeft, ChevronRight, Loader2, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getInitialWeekStart,
  getWeekRange,
  shiftWeekStart,
} from "@/lib/workforce/schedule-week";
import { buildShiftInstants, formatInTimezone } from "@/lib/workforce/timezone";
import { cn } from "@/lib/utils";

type Employee = { id: string; name: string };
type Location = { id: string; name: string; timezone?: string };
type Shift = {
  id: string;
  employeeId: string;
  startAt: string;
  endAt: string;
  notes?: string | null;
  employee: { id: string; name: string };
  location?: { id: string; name: string; timezone?: string } | null;
};

type ScheduleCalendarProps = {
  employees: Employee[];
  locations: Location[];
  weekStartDay: number;
  defaultTimezone?: string;
  canManage: boolean;
};

type FieldErrors = Record<string, string>;

function formatTime(dateStr: string, timezone?: string) {
  if (timezone) {
    return formatInTimezone(new Date(dateStr), timezone);
  }
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDayHeader(date: Date) {
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function ScheduleSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function ScheduleCalendar({
  employees,
  locations,
  weekStartDay,
  defaultTimezone = "America/New_York",
  canManage,
}: ScheduleCalendarProps) {
  const [weekStart, setWeekStart] = useState(() => getInitialWeekStart(weekStartDay));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [form, setForm] = useState({
    employeeId: "",
    locationId: "",
    date: "",
    startTime: "09:00",
    endTime: "17:00",
    overnight: false,
    notes: "",
  });

  const weekRange = useMemo(() => getWeekRange(weekStart), [weekStart]);
  const { weekDays, fromIso, toIso } = weekRange;
  const [retryCount, setRetryCount] = useState(0);
  const requestSeq = useRef(0);
  const hasLoadedOnce = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    const seq = ++requestSeq.current;
    const isInitial = !hasLoadedOnce.current;

    if (isInitial) {
      setInitialLoading(true);
    } else {
      setRefreshing(true);
    }
    setLoadError(null);

    (async () => {
      try {
        const res = await fetch(
          `/api/workforce/shifts?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`,
          { signal: controller.signal }
        );

        if (seq !== requestSeq.current) return;

        if (!res.ok) {
          const err = (await res.json().catch(() => null)) as { error?: string } | null;
          setLoadError(err?.error ?? "Failed to load schedule");
          return;
        }

        setShifts(await res.json());
        hasLoadedOnce.current = true;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (seq !== requestSeq.current) return;
        setLoadError("Failed to load schedule");
      } finally {
        if (seq === requestSeq.current) {
          setInitialLoading(false);
          setRefreshing(false);
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [fromIso, toIso, retryCount]);

  function prevWeek() {
    setWeekStart((current) => shiftWeekStart(current, -1));
  }

  function nextWeek() {
    setWeekStart((current) => shiftWeekStart(current, 1));
  }

  function openCreate(employeeId: string, date: Date) {
    setEditingShift(null);
    setFieldErrors({});
    setForm({
      employeeId,
      locationId: locations[0]?.id ?? "",
      date: date.toISOString().split("T")[0],
      startTime: "09:00",
      endTime: "17:00",
      overnight: false,
      notes: "",
    });
    setModalOpen(true);
  }

  function openEdit(shift: Shift) {
    const tz = shift.location?.timezone ?? defaultTimezone;
    const start = new Date(shift.startAt);
    setEditingShift(shift);
    setFieldErrors({});
    setForm({
      employeeId: shift.employeeId,
      locationId: shift.location?.id ?? "",
      date: start.toISOString().split("T")[0],
      startTime: start.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz }),
      endTime: new Date(shift.endAt).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: tz,
      }),
      overnight: new Date(shift.endAt).getDate() !== start.getDate(),
      notes: shift.notes ?? "",
    });
    setModalOpen(true);
  }

  function validateForm(): FieldErrors {
    const errors: FieldErrors = {};
    if (!form.employeeId) errors.employeeId = "Employee is required";
    if (!form.date) errors.date = "Date is required";
    if (!form.startTime) errors.startTime = "Start time is required";
    if (!form.endTime) errors.endTime = "End time is required";
    if (form.notes.length > 500) errors.notes = "Notes must be 500 characters or fewer";
    return errors;
  }

  async function saveShift() {
    if (isSaving) return;

    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    const location = locations.find((l) => l.id === form.locationId);
    const timezone = location?.timezone ?? defaultTimezone;

    let startAt: Date;
    let endAt: Date;
    try {
      const instants = buildShiftInstants({
        date: form.date,
        startTime: form.startTime,
        endTime: form.endTime,
        timezone,
        overnight: form.overnight,
      });
      startAt = instants.startAt;
      endAt = instants.endAt;
    } catch {
      setFieldErrors({ date: "Invalid date or time" });
      return;
    }

    if (endAt <= startAt) {
      setFieldErrors({ endTime: "End time must be after start time" });
      return;
    }

    const payload = {
      employeeId: form.employeeId,
      locationId: form.locationId || undefined,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      notes: form.notes || undefined,
    };

    const optimisticId = editingShift?.id ?? `temp-${Date.now()}`;
    const employee = employees.find((e) => e.id === form.employeeId);
    const previousShifts = shifts;

    if (!editingShift) {
      setShifts((current) => [
        ...current,
        {
          id: optimisticId,
          employeeId: form.employeeId,
          startAt: payload.startAt,
          endAt: payload.endAt,
          notes: payload.notes,
          employee: { id: form.employeeId, name: employee?.name ?? "" },
          location: location ?? null,
        },
      ]);
    } else {
      setShifts((current) =>
        current.map((s) =>
          s.id === editingShift.id
            ? {
                ...s,
                ...payload,
                employee: { id: form.employeeId, name: employee?.name ?? s.employee.name },
                location: location ?? null,
              }
            : s
        )
      );
    }

    setIsSaving(true);
    setFieldErrors({});

    try {
      const res = await fetch(
        editingShift ? `/api/workforce/shifts/${editingShift.id}` : "/api/workforce/shifts",
        {
          method: editingShift ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as {
          error?: string;
          fieldErrors?: Record<string, string[]>;
        } | null;
        setShifts(previousShifts);
        if (err?.fieldErrors) {
          const mapped: FieldErrors = {};
          for (const [key, messages] of Object.entries(err.fieldErrors)) {
            mapped[key] = messages[0] ?? "Invalid value";
          }
          setFieldErrors(mapped);
        }
        toast.error(err?.error ?? "Failed to save shift");
        return;
      }

      const saved = (await res.json()) as Shift;
      setShifts((current) =>
        editingShift
          ? current.map((s) => (s.id === editingShift.id ? saved : s))
          : current.map((s) => (s.id === optimisticId ? saved : s))
      );
      toast.success(editingShift ? "Shift updated" : "Shift created");
      setModalOpen(false);
    } catch {
      setShifts(previousShifts);
      toast.error("Failed to save shift");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteShift(id: string) {
    if (isSaving) return;
    const previousShifts = shifts;
    setShifts((current) => current.filter((s) => s.id !== id));
    setIsSaving(true);

    try {
      const res = await fetch(`/api/workforce/shifts/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setShifts(previousShifts);
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(err?.error ?? "Failed to cancel shift");
        return;
      }
      toast.success("Shift cancelled");
      setModalOpen(false);
    } catch {
      setShifts(previousShifts);
      toast.error("Failed to cancel shift");
    } finally {
      setIsSaving(false);
    }
  }

  function shiftsForCell(employeeId: string, day: Date) {
    return shifts.filter(
      (s) => s.employeeId === employeeId && isSameDay(new Date(s.startAt), day)
    );
  }

  function shiftsForDay(day: Date) {
    return shifts
      .filter((s) => isSameDay(new Date(s.startAt), day))
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  }

  const today = new Date();
  const navDisabled = initialLoading || refreshing || isSaving;

  function renderShiftButton(
    shift: Shift,
    options?: { showEmployee?: boolean; className?: string }
  ) {
    const tz = shift.location?.timezone ?? defaultTimezone;
    return (
      <button
        key={shift.id}
        type="button"
        className={cn(
          "w-full min-h-11 rounded-md bg-slate-900 px-3 py-2.5 text-left text-xs text-white hover:bg-slate-700",
          options?.className
        )}
        onClick={() => canManage && openEdit(shift)}
      >
        {options?.showEmployee && (
          <div className="font-medium text-white">{shift.employee.name}</div>
        )}
        <div>
          {formatTime(shift.startAt, tz)} – {formatTime(shift.endAt, tz)}
        </div>
        {shift.location && <div className="text-slate-300">{shift.location.name}</div>}
      </button>
    );
  }

  function renderAddButton(employeeId: string, day: Date, className?: string) {
    if (!canManage) return null;
    return (
      <button
        type="button"
        className={cn(
          "flex min-h-11 w-full items-center justify-center rounded-md border border-dashed border-slate-200 text-slate-400 hover:border-slate-400 hover:text-slate-600",
          className
        )}
        onClick={() => openCreate(employeeId, day)}
        aria-label="Add shift"
      >
        <Plus className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-11 w-11 min-h-11 min-w-11 shrink-0"
            onClick={prevWeek}
            disabled={navDisabled}
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="truncate text-sm font-medium text-slate-700">
            {formatDayHeader(weekDays[0])} – {formatDayHeader(weekDays[6])}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-11 w-11 min-h-11 min-w-11 shrink-0"
            onClick={nextWeek}
            disabled={navDisabled}
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          {refreshing && (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-400" aria-label="Refreshing schedule" />
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-11 min-h-11 shrink-0"
          disabled={navDisabled}
          onClick={() => setWeekStart(getInitialWeekStart(weekStartDay))}
        >
          This Week
        </Button>
      </div>

      {loadError && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{loadError}</span>
          <Button variant="outline" size="sm" onClick={() => setRetryCount((c) => c + 1)}>
            <RefreshCw className="mr-1 h-3 w-3" />
            Retry
          </Button>
        </div>
      )}

      {/* Mobile agenda / day list */}
      <div className={cn("md:hidden", refreshing && "opacity-80")}>
        {initialLoading ? (
          <Card>
            <CardContent className="p-0">
              <ScheduleSkeleton />
            </CardContent>
          </Card>
        ) : employees.length === 0 ? (
          <Card>
            <CardContent className="px-4 py-8 text-center text-sm text-slate-500">
              No active employees to schedule
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {weekDays.map((day) => {
              const dayShifts = shiftsForDay(day);
              const isToday = isSameDay(day, today);
              return (
                <Card key={day.toISOString()}>
                  <CardContent className="space-y-2 p-3">
                    <div
                      className={cn(
                        "px-1 text-sm font-semibold text-slate-700",
                        isToday && "text-blue-700"
                      )}
                    >
                      {formatDayHeader(day)}
                      {isToday && (
                        <span className="ml-2 text-xs font-medium text-blue-600">Today</span>
                      )}
                    </div>
                    {dayShifts.length === 0 ? (
                      <p className="px-1 py-2 text-sm text-slate-400">No shifts</p>
                    ) : (
                      <div className="space-y-2">
                        {dayShifts.map((shift) =>
                          renderShiftButton(shift, { showEmployee: true })
                        )}
                      </div>
                    )}
                    {renderAddButton(employees[0]?.id ?? "", day)}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Desktop week grid */}
      <Card className="hidden md:block">
        <CardContent className="overflow-x-auto p-0">
          {initialLoading ? (
            <ScheduleSkeleton />
          ) : (
            <table className="w-full min-w-[800px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3 text-left font-medium text-slate-600">
                    Employee
                  </th>
                  {weekDays.map((day) => (
                    <th
                      key={day.toISOString()}
                      className={cn(
                        "min-w-[120px] px-2 py-3 text-center font-medium text-slate-600",
                        isSameDay(day, today) && "bg-blue-50 text-blue-700"
                      )}
                    >
                      {formatDayHeader(day)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                      No active employees to schedule
                    </td>
                  </tr>
                ) : (
                  employees.map((emp) => (
                    <tr key={emp.id} className="border-b border-slate-100">
                      <td className="sticky left-0 z-10 bg-white px-4 py-3 font-medium text-slate-900">
                        {emp.name}
                      </td>
                      {weekDays.map((day) => {
                        const cellShifts = shiftsForCell(emp.id, day);
                        return (
                          <td
                            key={day.toISOString()}
                            className={cn(
                              "px-1 py-2 align-top",
                              isSameDay(day, today) && "bg-blue-50/50",
                              refreshing && "opacity-80"
                            )}
                          >
                            <div className="space-y-1">
                              {cellShifts.map((shift) => renderShiftButton(shift))}
                              {renderAddButton(emp.id, day)}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {modalOpen && canManage && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
          <Card className="flex max-h-[min(92dvh,100%)] w-full max-w-md flex-col overflow-hidden rounded-b-none rounded-t-2xl pb-[env(safe-area-inset-bottom)] sm:max-h-[min(90dvh,900px)] sm:rounded-xl sm:pb-0">
            <CardContent className="space-y-4 overflow-y-auto pt-6">
              <h3 className="text-lg font-semibold">
                {editingShift ? "Edit Shift" : "New Shift"}
              </h3>
              <div className="space-y-2">
                <Label>Employee</Label>
                <Select
                  value={form.employeeId}
                  onValueChange={(v) => setForm((f) => ({ ...f, employeeId: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldErrors.employeeId && (
                  <p className="text-sm text-red-600">{fieldErrors.employeeId}</p>
                )}
              </div>
              {locations.length > 0 && (
                <div className="space-y-2">
                  <Label>Location</Label>
                  <Select
                    value={form.locationId}
                    onValueChange={(v) => setForm((f) => ({ ...f, locationId: v }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {locations.map((l) => (
                        <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
                {fieldErrors.date && <p className="text-sm text-red-600">{fieldErrors.date}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start</Label>
                  <Input
                    type="time"
                    value={form.startTime}
                    onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                  />
                  {fieldErrors.startTime && (
                    <p className="text-sm text-red-600">{fieldErrors.startTime}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>End</Label>
                  <Input
                    type="time"
                    value={form.endTime}
                    onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                  />
                  {fieldErrors.endTime && (
                    <p className="text-sm text-red-600">{fieldErrors.endTime}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="overnight"
                  checked={form.overnight}
                  onCheckedChange={(checked) =>
                    setForm((f) => ({ ...f, overnight: checked === true }))
                  }
                />
                <Label htmlFor="overnight">Overnight shift (end time is next day)</Label>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                />
                {fieldErrors.notes && <p className="text-sm text-red-600">{fieldErrors.notes}</p>}
              </div>
              <div className="flex flex-wrap gap-2 pb-2 sm:pb-0">
                <Button onClick={saveShift} className="flex-1" disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : editingShift ? (
                    "Update"
                  ) : (
                    "Create"
                  )}
                </Button>
                {editingShift && (
                  <Button
                    variant="destructive"
                    disabled={isSaving}
                    onClick={() => deleteShift(editingShift.id)}
                  >
                    Cancel Shift
                  </Button>
                )}
                <Button variant="outline" disabled={isSaving} onClick={() => setModalOpen(false)}>
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
