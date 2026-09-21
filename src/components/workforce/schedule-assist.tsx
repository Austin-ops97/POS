"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

type Slot = {
  date: string;
  startTime: string;
  endTime: string;
  headcount: string;
  requiredRole: string;
  projectTitle: string;
};

type Suggestion = {
  estimatedLaborCost: number;
  laborCostAlert: boolean;
  warnings: Array<{ code: string; message: string }>;
  unfilled: Array<{ slotId: string; missing: number }>;
  assignments: Array<{
    employeeId: string;
    employeeName: string;
    locationId: string | null;
    startAt: string;
    endAt: string;
    estimatedCost: number;
    warnings: Array<{ message: string }>;
  }>;
};

const emptySlot = (): Slot => ({ date: "", startTime: "09:00", endTime: "17:00", headcount: "1", requiredRole: "", projectTitle: "" });

export function ScheduleAssist({
  locations,
}: {
  locations: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [slots, setSlots] = useState<Slot[]>([emptySlot()]);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function updateSlot(index: number, patch: Partial<Slot>) {
    setSlots((items) => items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
    setSuggestion(null);
    setApproved(false);
  }

  async function suggest() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/workforce/schedule/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId: locationId || null,
          slots: slots.map((slot) => ({
            date: slot.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            headcount: Number(slot.headcount),
            requiredRole: slot.requiredRole || null,
            projectTitle: slot.projectTitle || null,
          })),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not build suggestions");
      setSuggestion(payload);
      setApproved(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not build suggestions");
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!suggestion || !approved) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/workforce/schedule/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignments: suggestion.assignments.map((row) => ({
            employeeId: row.employeeId,
            locationId: row.locationId,
            startAt: row.startAt,
            endAt: row.endAt,
          })),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not publish");
      const failed = payload.failed?.length ?? 0;
      if (!payload.created?.length) {
        setError(payload.failed?.[0]?.error ?? "Nothing was published");
        return;
      }
      toast.success(failed ? `Published ${payload.created.length} shifts. ${failed} still need a change.` : "Schedule published");
      router.push("/workforce/schedule");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not publish");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Shifts to fill</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-500">
            Suggestions use availability, approved time off, existing shifts, role, project assignment, hour limits, and hourly cost. They stay a draft until you publish them.
          </p>
          <div className="max-w-sm space-y-2">
            <Label htmlFor="assist-location">Location</Label>
            <select id="assist-location" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" value={locationId} onChange={(event) => setLocationId(event.target.value)}>
              <option value="">No location</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </div>
          {slots.map((slot, index) => (
            <div key={index} className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-3">
              <Input type="date" value={slot.date} onChange={(event) => updateSlot(index, { date: event.target.value })} aria-label={`Shift ${index + 1} date`} />
              <Input type="time" value={slot.startTime} onChange={(event) => updateSlot(index, { startTime: event.target.value })} aria-label={`Shift ${index + 1} start`} />
              <Input type="time" value={slot.endTime} onChange={(event) => updateSlot(index, { endTime: event.target.value })} aria-label={`Shift ${index + 1} end`} />
              <Input type="number" min="1" value={slot.headcount} onChange={(event) => updateSlot(index, { headcount: event.target.value })} aria-label={`Shift ${index + 1} people needed`} />
              <Input placeholder="Role needed" value={slot.requiredRole} onChange={(event) => updateSlot(index, { requiredRole: event.target.value })} />
              <Input placeholder="Project" value={slot.projectTitle} onChange={(event) => updateSlot(index, { projectTitle: event.target.value })} />
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setSlots((items) => [...items, emptySlot()])}>
              Add shift
            </Button>
            <Button type="button" onClick={() => void suggest()} disabled={busy || slots.some((slot) => !slot.date)}>
              {busy ? "Working…" : "Suggest schedule"}
            </Button>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </CardContent>
      </Card>
      {suggestion ? (
        <Card>
          <CardHeader>
            <CardTitle>Suggested schedule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-700">
              Estimated labor cost <span className="font-semibold">{formatCurrency(suggestion.estimatedLaborCost)}</span>
              {suggestion.laborCostAlert ? <span className="ml-2 text-amber-700">Above the labor-cost alert</span> : null}
            </p>
            {suggestion.assignments.length === 0 ? <p className="text-sm text-slate-500">No one could be assigned. Adjust the shifts or availability.</p> : null}
            {suggestion.assignments.map((row, index) => (
              <div key={`${row.employeeId}-${index}`} className="rounded-xl border border-slate-200 p-3 text-sm">
                <p className="font-medium text-slate-900">
                  {row.employeeName} · {formatCurrency(row.estimatedCost)}
                </p>
                <p className="text-slate-500">
                  {new Date(row.startAt).toLocaleString()} – {new Date(row.endAt).toLocaleTimeString()}
                </p>
                {row.warnings.map((warning) => (
                  <p key={warning.message} className="text-amber-700">
                    {warning.message}
                  </p>
                ))}
              </div>
            ))}
            {suggestion.unfilled.map((row) => (
              <p key={row.slotId} className="text-sm text-amber-700">
                {row.slotId} is still short {row.missing}.
              </p>
            ))}
            {suggestion.assignments.length > 0 ? (
              <>
                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={approved} onChange={(event) => setApproved(event.target.checked)} />
                  I reviewed these suggestions and want them added to the schedule.
                </label>
                <Button type="button" disabled={!approved || busy} onClick={() => void publish()}>
                  Publish approved shifts
                </Button>
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
