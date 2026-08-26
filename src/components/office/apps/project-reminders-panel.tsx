"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Loader2, Pause, Play, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ReminderComposer } from "./reminder-composer";
import { describeReminderRecipients } from "@/lib/office/reminder-form";

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
    includeAllEmployees: boolean;
    includeAllCustomers: boolean;
    employeeIds: string[];
    emails: string[];
  };
};

async function apiError(response: Response) {
  const body = await response.json().catch(() => null);
  return body?.error ?? "Request failed";
}

export function ProjectRemindersPanel({
  projectId,
}: {
  projectId: string;
  employees?: Array<{ id: string; name: string }>;
}) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);

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
        <Button type="button" variant="ghost" size="sm" className="h-8 min-h-8 px-2 text-xs" onClick={() => setShowForm(true)}>
          Add
        </Button>
      </div>

      <ReminderComposer
        open={showForm}
        onOpenChange={setShowForm}
        projectId={projectId}
        onCreated={load}
      />

      <div className="mt-1.5 max-h-28 space-y-1 overflow-y-auto">
        {loading ? (
          <p className="text-xs text-slate-500">Loading…</p>
        ) : reminders.length === 0 ? (
          <p className="text-xs text-slate-400">No reminders yet</p>
        ) : (
          reminders.map((reminder) => (
            <article key={reminder.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-slate-800">{reminder.title}</p>
                <p className="truncate text-[11px] text-slate-400">
                  {describeReminderRecipients(reminder.recipients)}
                </p>
              </div>
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
