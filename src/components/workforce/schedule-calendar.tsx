"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getWeekStart, getWeekDays } from "@/lib/workforce/pay-period";
import { cn } from "@/lib/utils";

type Employee = { id: string; name: string };
type Location = { id: string; name: string };
type Shift = {
  id: string;
  employeeId: string;
  startAt: string;
  endAt: string;
  notes?: string | null;
  employee: { id: string; name: string };
  location?: { id: string; name: string } | null;
};

type ScheduleCalendarProps = {
  employees: Employee[];
  locations: Location[];
  weekStartDay: number;
  canManage: boolean;
};

function formatTime(dateStr: string) {
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

export function ScheduleCalendar({
  employees,
  locations,
  weekStartDay,
  canManage,
}: ScheduleCalendarProps) {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date(), weekStartDay));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [form, setForm] = useState({
    employeeId: "",
    locationId: "",
    date: "",
    startTime: "09:00",
    endTime: "17:00",
    notes: "",
  });

  const weekDays = getWeekDays(weekStart);
  const weekEnd = new Date(weekDays[6]);
  weekEnd.setHours(23, 59, 59, 999);

  const loadShifts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/workforce/shifts?from=${weekStart.toISOString()}&to=${weekEnd.toISOString()}`
      );
      if (res.ok) {
        setShifts(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, [weekStart, weekEnd]);

  useEffect(() => {
    loadShifts();
  }, [loadShifts]);

  function prevWeek() {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    setWeekStart(d);
  }

  function nextWeek() {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    setWeekStart(d);
  }

  function openCreate(employeeId: string, date: Date) {
    setEditingShift(null);
    setForm({
      employeeId,
      locationId: locations[0]?.id ?? "",
      date: date.toISOString().split("T")[0],
      startTime: "09:00",
      endTime: "17:00",
      notes: "",
    });
    setModalOpen(true);
  }

  function openEdit(shift: Shift) {
    const start = new Date(shift.startAt);
    setEditingShift(shift);
    setForm({
      employeeId: shift.employeeId,
      locationId: shift.location?.id ?? "",
      date: start.toISOString().split("T")[0],
      startTime: start.toTimeString().slice(0, 5),
      endTime: new Date(shift.endAt).toTimeString().slice(0, 5),
      notes: shift.notes ?? "",
    });
    setModalOpen(true);
  }

  async function saveShift() {
    const startAt = new Date(`${form.date}T${form.startTime}:00`);
    const endAt = new Date(`${form.date}T${form.endTime}:00`);

    const payload = {
      employeeId: form.employeeId,
      locationId: form.locationId || undefined,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      notes: form.notes || undefined,
    };

    const res = await fetch(
      editingShift ? `/api/workforce/shifts/${editingShift.id}` : "/api/workforce/shifts",
      {
        method: editingShift ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      toast.error(err?.error ?? "Failed to save shift");
      return;
    }

    toast.success(editingShift ? "Shift updated" : "Shift created");
    setModalOpen(false);
    loadShifts();
  }

  async function deleteShift(id: string) {
    const res = await fetch(`/api/workforce/shifts/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to cancel shift");
      return;
    }
    toast.success("Shift cancelled");
    setModalOpen(false);
    loadShifts();
  }

  function shiftsForCell(employeeId: string, day: Date) {
    return shifts.filter(
      (s) =>
        s.employeeId === employeeId &&
        isSameDay(new Date(s.startAt), day)
    );
  }

  const today = new Date();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={prevWeek}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium text-slate-700">
            {formatDayHeader(weekDays[0])} – {formatDayHeader(weekDays[6])}
          </span>
          <Button variant="outline" size="icon" onClick={nextWeek}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button variant="outline" size="sm" onClick={() => setWeekStart(getWeekStart(new Date(), weekStartDay))}>
          This Week
        </Button>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          {loading ? (
            <p className="p-8 text-center text-sm text-slate-500">Loading schedule...</p>
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
                        "px-2 py-3 text-center font-medium text-slate-600 min-w-[120px]",
                        isSameDay(day, today) && "bg-blue-50 text-blue-700"
                      )}
                    >
                      {formatDayHeader(day)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => (
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
                            isSameDay(day, today) && "bg-blue-50/50"
                          )}
                        >
                          <div className="space-y-1">
                            {cellShifts.map((shift) => (
                              <button
                                key={shift.id}
                                type="button"
                                className="w-full rounded-md bg-slate-900 px-2 py-1.5 text-left text-xs text-white hover:bg-slate-700"
                                onClick={() => canManage && openEdit(shift)}
                              >
                                <div>{formatTime(shift.startAt)} – {formatTime(shift.endAt)}</div>
                                {shift.location && (
                                  <div className="text-slate-300">{shift.location.name}</div>
                                )}
                              </button>
                            ))}
                            {canManage && (
                              <button
                                type="button"
                                className="flex w-full items-center justify-center rounded-md border border-dashed border-slate-200 py-1 text-slate-400 hover:border-slate-400 hover:text-slate-600"
                                onClick={() => openCreate(emp.id, day)}
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {modalOpen && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <CardContent className="space-y-4 pt-6">
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
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start</Label>
                  <Input
                    type="time"
                    value={form.startTime}
                    onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>End</Label>
                  <Input
                    type="time"
                    value={form.endTime}
                    onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={saveShift} className="flex-1">
                  {editingShift ? "Update" : "Create"}
                </Button>
                {editingShift && (
                  <Button variant="destructive" onClick={() => deleteShift(editingShift.id)}>
                    Cancel Shift
                  </Button>
                )}
                <Button variant="outline" onClick={() => setModalOpen(false)}>
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
