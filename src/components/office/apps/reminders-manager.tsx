"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ReminderComposer } from "./reminder-composer";
import { describeReminderRecipients } from "@/lib/office/reminder-form";
import { useFormatDate } from "@/components/providers/timezone-provider";

type View = "upcoming" | "sent" | "failed";

type UpcomingReminder = {
  id: string;
  title: string;
  nextSendAt: string;
  recurrence: string;
  paused: boolean;
  enabled: boolean;
  recipients?: {
    includeOwner: boolean;
    includeAdmins: boolean;
    includeAllEmployees: boolean;
    includeAllCustomers: boolean;
    employeeIds: string[];
    emails: string[];
  };
  project?: { id: string; title: string; status: string };
};

type DeliveryRow = {
  id: string;
  status: string;
  recipientEmail: string;
  sentAt: string | null;
  failedAt: string | null;
  failureMessage: string | null;
  occurrenceAt: string;
  createdAt: string;
  reminder: { id: string; title: string; projectId: string; project?: { id: string; title: string } };
};

async function apiError(response: Response) {
  const body = await response.json().catch(() => null);
  return body?.error ?? "Request failed";
}

export function RemindersManager() {
  const formatDate = useFormatDate();
  const [view, setView] = useState<View>("upcoming");
  const [reminders, setReminders] = useState<UpcomingReminder[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/office/reminders?view=${view}`);
      if (!res.ok) throw new Error(await apiError(res));
      const data = await res.json();
      if (view === "upcoming") {
        setReminders(data.reminders ?? []);
        setDeliveries([]);
      } else {
        setDeliveries(data.deliveries ?? []);
        setReminders([]);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load reminders");
    } finally {
      setLoading(false);
    }
  }, [view]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="rounded-xl bg-amber-100 p-2 text-amber-700">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-950">Project reminders</h1>
            <p className="text-sm text-slate-500">Create schedules and review delivery history across projects.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["upcoming", "sent", "failed"] as View[]).map((key) => (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={view === key ? "default" : "outline"}
              onClick={() => setView(key)}
            >
              {key[0].toUpperCase() + key.slice(1)}
            </Button>
          ))}
          <Button type="button" size="sm" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            New reminder
          </Button>
        </div>
      </div>

      <ReminderComposer open={showForm} onOpenChange={setShowForm} onCreated={load} />

      {loading ? (
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : view === "upcoming" ? (
        <div className="space-y-3">
          {!reminders.length ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
              <p className="text-sm text-slate-500">
                No upcoming reminders. Create one to email employees, customers, or specific addresses.
              </p>
              <Button type="button" className="mt-4" onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4" />
                New reminder
              </Button>
            </div>
          ) : (
            reminders.map((reminder) => (
              <article key={reminder.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-950">{reminder.title}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {reminder.project?.title ?? "Project"} · next {formatDate(reminder.nextSendAt)}
                    </p>
                    {reminder.recipients ? (
                      <p className="mt-1 text-xs text-slate-400">{describeReminderRecipients(reminder.recipients)}</p>
                    ) : null}
                  </div>
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    {reminder.recurrence.replace("_", " ")}
                    {reminder.paused ? " · paused" : ""}
                  </span>
                </div>
              </article>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {!deliveries.length ? (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
              No {view} deliveries yet.
            </p>
          ) : (
            deliveries.map((row) => (
              <article key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-950">{row.reminder.title}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {row.reminder.project?.title ?? "Project"} → {row.recipientEmail}
                    </p>
                    {row.failureMessage ? <p className="mt-1 text-sm text-red-600">{row.failureMessage}</p> : null}
                  </div>
                  <span className="text-xs text-slate-400">
                    {formatDate(row.sentAt ?? row.failedAt ?? row.createdAt)}
                  </span>
                </div>
              </article>
            ))
          )}
        </div>
      )}
    </div>
  );
}
