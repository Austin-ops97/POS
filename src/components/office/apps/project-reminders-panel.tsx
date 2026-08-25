"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Bell, Loader2, Pause, Play, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EmployeeOption } from "./record-client";
import {
  captureSubmitForm,
  reminderPayloadFromFormData,
  resetFormSafely,
} from "@/lib/office/reminder-form";

type Reminder = {
  id: string;
  title: string;
  message: string | null;
  timezone: string;
  scheduledAt: string;
  nextSendAt: string;
  recurrence: string;
  intervalCount: number;
  sendBeforeMinutes: number;
  enabled: boolean;
  paused: boolean;
  occurrenceCount: number;
  recipients: {
    includeOwner: boolean;
    includeAdmins: boolean;
    employeeIds: string[];
    emails: string[];
  };
};

async function apiError(response: Response) {
  const body = await response.json().catch(() => null);
  return body?.error ?? "Request failed";
}

function localInputValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ProjectRemindersPanel({
  projectId,
  employees,
}: {
  projectId: string;
  employees: EmployeeOption[];
}) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/office/projects/${projectId}/reminders`);
      if (!res.ok) throw new Error(await apiError(res));
      setReminders(await res.json());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load reminders");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createReminder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = captureSubmitForm(event);
    if (submittingRef.current || busy) return;
    const parsed = reminderPayloadFromFormData(new FormData(form));
    if ("error" in parsed) {
      setFormError(parsed.error);
      setFormSuccess(null);
      return;
    }
    submittingRef.current = true;
    setBusy(true);
    setFormError(null);
    setFormSuccess(null);
    try {
      const res = await fetch(`/api/office/projects/${projectId}/reminders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      if (!res.ok) throw new Error(await apiError(res));
      toast.success("Reminder scheduled");
      setFormSuccess("Reminder scheduled");
      setShowForm(false);
      resetFormSafely(form);
      await load();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not create reminder";
      setFormError(message);
      toast.error(message);
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }

  async function togglePause(reminder: Reminder) {
    setBusy(true);
    try {
      const res = await fetch(`/api/office/reminders/${reminder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: !reminder.paused }),
      });
      if (!res.ok) throw new Error(await apiError(res));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update reminder");
    } finally {
      setBusy(false);
    }
  }

  async function remove(reminder: Reminder) {
    if (!confirm("Delete this reminder?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/office/reminders/${reminder.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await apiError(res));
      toast.success("Reminder deleted");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete reminder");
    } finally {
      setBusy(false);
    }
  }

  async function testSend(reminder: Reminder) {
    setBusy(true);
    try {
      const res = await fetch(`/api/office/reminders/${reminder.id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) throw new Error(await apiError(res));
      toast.success("Test email sent");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Test send failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-amber-600" />
          <h3 className="text-sm font-semibold text-slate-900">Reminders</h3>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "Add reminder"}
        </Button>
      </div>

      {showForm ? (
        <form onSubmit={createReminder} className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <label className="text-sm font-medium">
            Title
            <Input name="title" required className="mt-1" placeholder="Follow up on deliverables" />
          </label>
          <label className="text-sm font-medium">
            Message
            <textarea
              name="message"
              rows={3}
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              placeholder="Optional email body"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Send at
              <Input
                name="scheduledAt"
                type="datetime-local"
                required
                className="mt-1"
                defaultValue={localInputValue(new Date(Date.now() + 3600_000).toISOString())}
              />
            </label>
            <label className="text-sm font-medium">
              Timezone
              <Input name="timezone" className="mt-1" defaultValue="America/Chicago" />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm font-medium">
              Recurrence
              <select name="recurrence" className="mt-1 h-10 w-full rounded-md border px-3 text-sm" defaultValue="ONE_TIME">
                <option value="ONE_TIME">One time</option>
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
              </select>
            </label>
            <label className="text-sm font-medium">
              Interval
              <Input name="intervalCount" type="number" min={1} defaultValue={1} className="mt-1" />
            </label>
            <label className="text-sm font-medium">
              Minutes before
              <Input name="sendBeforeMinutes" type="number" min={0} defaultValue={0} className="mt-1" />
            </label>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" name="includeOwner" defaultChecked /> Project owner
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" name="includeAdmins" /> Admins
            </label>
          </div>
          <label className="text-sm font-medium">
            Team members
            <select name="employeeIds" multiple className="mt-1 h-28 w-full rounded-md border px-3 py-2 text-sm">
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Extra emails
            <Input name="emails" className="mt-1" placeholder="person@example.com" />
          </label>
          {formError ? (
            <p className="text-sm text-red-600" role="alert">
              {formError}
            </p>
          ) : null}
          {formSuccess ? (
            <p className="text-sm text-emerald-700" role="status">
              {formSuccess}
            </p>
          ) : null}
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {busy ? "Scheduling…" : "Schedule reminder"}
          </Button>
        </form>
      ) : null}

      <div className="mt-4 space-y-2">
        {loading ? (
          <p className="text-sm text-slate-500">Loading reminders…</p>
        ) : reminders.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
            No reminders yet for this project.
          </p>
        ) : (
          reminders.map((reminder) => (
            <article key={reminder.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-900">{reminder.title}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Next: {new Date(reminder.nextSendAt).toLocaleString()} · {reminder.recurrence.toLowerCase().replace("_", " ")}
                    {reminder.paused ? " · paused" : ""}
                    {!reminder.enabled ? " · completed" : ""}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void testSend(reminder)} aria-label="Test send">
                    <Send className="h-4 w-4" />
                  </Button>
                  <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void togglePause(reminder)} aria-label={reminder.paused ? "Resume" : "Pause"}>
                    {reminder.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void remove(reminder)} aria-label="Delete">
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
