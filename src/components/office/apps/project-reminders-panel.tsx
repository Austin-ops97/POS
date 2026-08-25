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
}: {
  projectId: string;
  employees: EmployeeOption[];
}) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
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
      return;
    }
    submittingRef.current = true;
    setBusy(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/office/projects/${projectId}/reminders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      if (!res.ok) throw new Error(await apiError(res));
      toast.success("Reminder scheduled");
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
    <section className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Bell className="h-3.5 w-3.5 shrink-0 text-amber-600" />
          <h3 className="text-sm font-semibold text-slate-900">Reminders</h3>
          {reminders.length ? <span className="text-xs text-slate-400">{reminders.length}</span> : null}
        </div>
        <Button type="button" variant="ghost" size="sm" className="h-8 min-h-8 px-2 text-xs" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "Add"}
        </Button>
      </div>

      {showForm ? (
        <form onSubmit={createReminder} className="mt-2 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <Input name="title" required className="h-9" placeholder="Follow up" />
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              name="scheduledAt"
              type="datetime-local"
              required
              className="h-9"
              defaultValue={localInputValue(new Date(Date.now() + 3600_000).toISOString())}
            />
            <Input name="timezone" className="h-9" defaultValue="America/Chicago" />
          </div>
          <input type="hidden" name="recurrence" value="ONE_TIME" />
          <input type="hidden" name="intervalCount" value="1" />
          <input type="hidden" name="sendBeforeMinutes" value="0" />
          <input type="hidden" name="includeOwner" value="on" />
          {formError ? (
            <p className="text-xs text-red-600" role="alert">
              {formError}
            </p>
          ) : null}
          <Button type="submit" size="sm" className="h-8 min-h-8" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {busy ? "Scheduling…" : "Schedule"}
          </Button>
        </form>
      ) : null}

      <div className="mt-1.5 max-h-16 space-y-1 overflow-y-auto">
        {loading ? (
          <p className="text-xs text-slate-500">Loading…</p>
        ) : reminders.length === 0 ? (
          <p className="text-xs text-slate-400">No reminders yet</p>
        ) : (
          reminders.map((reminder) => (
            <article key={reminder.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1">
              <p className="min-w-0 flex-1 truncate text-xs font-medium text-slate-800">{reminder.title}</p>
              <p className="hidden shrink-0 text-[11px] text-slate-400 sm:block">
                {new Date(reminder.nextSendAt).toLocaleDateString()}
              </p>
              <div className="flex shrink-0">
                <button type="button" className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-700" disabled={busy} onClick={() => void testSend(reminder)} aria-label="Test send">
                  <Send className="h-3.5 w-3.5" />
                </button>
                <button type="button" className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-700" disabled={busy} onClick={() => void togglePause(reminder)} aria-label={reminder.paused ? "Resume" : "Pause"}>
                  {reminder.paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                </button>
                <button type="button" className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-red-500" disabled={busy} onClick={() => void remove(reminder)} aria-label="Delete">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
