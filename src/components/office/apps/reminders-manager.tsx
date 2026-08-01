"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type View = "upcoming" | "sent" | "failed";

type UpcomingReminder = {
  id: string;
  title: string;
  nextSendAt: string;
  recurrence: string;
  paused: boolean;
  enabled: boolean;
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
  const [view, setView] = useState<View>("upcoming");
  const [reminders, setReminders] = useState<UpcomingReminder[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [loading, setLoading] = useState(true);

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
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="rounded-xl bg-amber-100 p-2 text-amber-700">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-950">Project reminders</h1>
            <p className="text-sm text-slate-500">Upcoming schedules and delivery history across projects.</p>
          </div>
        </div>
        <div className="flex gap-2">
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
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : view === "upcoming" ? (
        <div className="space-y-3">
          {!reminders.length ? (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
              No upcoming reminders.
            </p>
          ) : (
            reminders.map((reminder) => (
              <article key={reminder.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-950">{reminder.title}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {reminder.project?.title ?? "Project"} · next {new Date(reminder.nextSendAt).toLocaleString()}
                    </p>
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
                    {new Date(row.sentAt ?? row.failedAt ?? row.createdAt).toLocaleString()}
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
