"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type WindowRow = { weekday: number; enabled: boolean; start: string; end: string };
type ExceptionRow = {
  id: string;
  date: string;
  available: boolean;
  startMinute: number | null;
  endMinute: number | null;
  note: string | null;
};

function toTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function fromTime(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function blankWeek(windows: Array<{ weekday: number; startMinute: number; endMinute: number }>): WindowRow[] {
  return DAYS.map((_, weekday) => {
    const found = windows.find((window) => window.weekday === weekday);
    return {
      weekday,
      enabled: Boolean(found),
      start: toTime(found?.startMinute ?? 9 * 60),
      end: toTime(found?.endMinute ?? 17 * 60),
    };
  });
}

export function AvailabilityEditor({
  employees,
  initialEmployeeId,
  initialWindows,
  initialExceptions,
  initialMax,
  initialPreferred,
  canEdit,
}: {
  employees: Array<{ id: string; name: string }> | null;
  initialEmployeeId: string;
  initialWindows: Array<{ weekday: number; startMinute: number; endMinute: number }>;
  initialExceptions: ExceptionRow[];
  initialMax: number | null;
  initialPreferred: number | null;
  canEdit: boolean;
}) {
  const [employeeId, setEmployeeId] = useState(initialEmployeeId);
  const [days, setDays] = useState(() => blankWeek(initialWindows));
  const [exceptions, setExceptions] = useState(initialExceptions);
  const [maxHours, setMaxHours] = useState(initialMax?.toString() ?? "");
  const [preferredHours, setPreferredHours] = useState(initialPreferred?.toString() ?? "");
  const [exceptionDate, setExceptionDate] = useState("");
  const [exceptionAvailable, setExceptionAvailable] = useState(false);
  const [exceptionStart, setExceptionStart] = useState("09:00");
  const [exceptionEnd, setExceptionEnd] = useState("17:00");
  const [exceptionNote, setExceptionNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load(nextId: string) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/workforce/availability?employeeId=${nextId}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not load availability");
      setDays(blankWeek(payload.windows ?? []));
      setExceptions(
        (payload.exceptions ?? []).map((item: ExceptionRow & { date: string }) => ({
          ...item,
          date: String(item.date).slice(0, 10),
        }))
      );
      setMaxHours(payload.employee?.maxWeeklyHours?.toString() ?? "");
      setPreferredHours(payload.employee?.preferredWeeklyHours?.toString() ?? "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load availability");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/workforce/availability", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId,
          maxWeeklyHours: maxHours === "" ? null : Number(maxHours),
          preferredWeeklyHours: preferredHours === "" ? null : Number(preferredHours),
          windows: days
            .filter((day) => day.enabled)
            .map((day) => ({ weekday: day.weekday, startMinute: fromTime(day.start), endMinute: fromTime(day.end) })),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not save availability");
      toast.success("Availability saved");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not save availability";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function addException() {
    if (!exceptionDate) return;
    setSaving(true);
    try {
      const response = await fetch("/api/workforce/availability/exceptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId,
          date: exceptionDate,
          available: exceptionAvailable,
          startMinute: exceptionAvailable ? fromTime(exceptionStart) : null,
          endMinute: exceptionAvailable ? fromTime(exceptionEnd) : null,
          note: exceptionNote || null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not add the exception");
      setExceptions((items) => [...items, { ...payload, date: exceptionDate }]);
      setExceptionNote("");
      toast.success("Exception added");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not add the exception");
    } finally {
      setSaving(false);
    }
  }

  async function removeException(id: string) {
    const response = await fetch(`/api/workforce/availability/exceptions?employeeId=${employeeId}&id=${id}`, { method: "DELETE" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(payload.error ?? "Could not remove the exception");
      return;
    }
    setExceptions((items) => items.filter((item) => item.id !== id));
  }

  return (
    <div className="space-y-5">
      {employees ? (
        <div className="max-w-sm space-y-2">
          <Label htmlFor="availability-employee">Employee</Label>
          <select
            id="availability-employee"
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
            value={employeeId}
            onChange={(event) => {
              setEmployeeId(event.target.value);
              void load(event.target.value);
            }}
          >
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {loading ? <p className="text-sm text-slate-500">Loading availability…</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <Card>
        <CardHeader>
          <CardTitle>Weekly availability</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-500">Days left off are unavailable. Approved time off still blocks a shift on an otherwise open day.</p>
          {days.map((day) => (
            <div key={day.weekday} className="grid gap-2 sm:grid-cols-[9rem_auto_1fr_1fr] sm:items-center">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <input
                  type="checkbox"
                  checked={day.enabled}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setDays((items) => items.map((item) => (item.weekday === day.weekday ? { ...item, enabled: event.target.checked } : item)))
                  }
                />
                {DAYS[day.weekday]}
              </label>
              <span className="text-xs text-slate-400">{day.enabled ? "Available" : "Unavailable"}</span>
              <Input type="time" value={day.start} disabled={!canEdit || !day.enabled} onChange={(event) => setDays((items) => items.map((item) => (item.weekday === day.weekday ? { ...item, start: event.target.value } : item)))} />
              <Input type="time" value={day.end} disabled={!canEdit || !day.enabled} onChange={(event) => setDays((items) => items.map((item) => (item.weekday === day.weekday ? { ...item, end: event.target.value } : item)))} />
            </div>
          ))}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="preferred-hours">Preferred hours / week</Label>
              <Input id="preferred-hours" type="number" min="0" step="0.5" value={preferredHours} disabled={!canEdit} onChange={(event) => setPreferredHours(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="max-hours">Max hours / week</Label>
              <Input id="max-hours" type="number" min="0" step="0.5" value={maxHours} disabled={!canEdit} onChange={(event) => setMaxHours(event.target.value)} />
            </div>
          </div>
          {canEdit ? (
            <Button type="button" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save weekly availability"}
            </Button>
          ) : (
            <p className="text-sm text-slate-500">You can view this schedule. A manager can edit it.</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Temporary exceptions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {exceptions.length === 0 ? <p className="text-sm text-slate-500">No date exceptions yet.</p> : null}
          {exceptions.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <span>
                {item.date} · {item.available ? "Available" : "Unavailable"}
                {item.note ? ` · ${item.note}` : ""}
              </span>
              {canEdit ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => void removeException(item.id)}>
                  Remove
                </Button>
              ) : null}
            </div>
          ))}
          {canEdit ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <Input type="date" value={exceptionDate} onChange={(event) => setExceptionDate(event.target.value)} />
              <select className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm" value={exceptionAvailable ? "open" : "closed"} onChange={(event) => setExceptionAvailable(event.target.value === "open")}>
                <option value="closed">Unavailable that day</option>
                <option value="open">Different hours</option>
              </select>
              {exceptionAvailable ? (
                <>
                  <Input type="time" value={exceptionStart} onChange={(event) => setExceptionStart(event.target.value)} />
                  <Input type="time" value={exceptionEnd} onChange={(event) => setExceptionEnd(event.target.value)} />
                </>
              ) : null}
              <Input placeholder="Note" value={exceptionNote} onChange={(event) => setExceptionNote(event.target.value)} />
              <Button type="button" variant="outline" disabled={saving || !exceptionDate} onClick={() => void addException()}>
                Add exception
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
