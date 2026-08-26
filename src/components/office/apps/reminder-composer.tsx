"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  captureSubmitForm,
  reminderPayloadFromFormData,
  resetFormSafely,
} from "@/lib/office/reminder-form";

type ProjectOption = { id: string; title: string };

function localInputValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function apiError(response: Response) {
  const body = await response.json().catch(() => null);
  return body?.error ?? "Request failed";
}

export function ReminderComposer({
  open,
  onOpenChange,
  projectId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
  onCreated?: () => void | Promise<void>;
}) {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(!projectId);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [scheduledAt, setScheduledAt] = useState(() =>
    localInputValue(new Date(Date.now() + 3600_000).toISOString())
  );
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    setScheduledAt(localInputValue(new Date(Date.now() + 3600_000).toISOString()));
    if (projectId) return;
    let cancelled = false;
    setLoadingProjects(true);
    void fetch("/api/office/workspaces/projects/records?includeComplete=true")
      .then(async (res) => {
        if (!res.ok) throw new Error(await apiError(res));
        const rows = (await res.json()) as Array<{ id: string; title: string }>;
        if (!cancelled) setProjects(rows.map((row) => ({ id: row.id, title: row.title })));
      })
      .catch((error) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "Could not load projects";
          setFormError(message);
          toast.error(message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingProjects(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectId]);

  async function createReminder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = captureSubmitForm(event);
    if (submittingRef.current || busy) return;
    const parsed = reminderPayloadFromFormData(new FormData(form));
    if ("error" in parsed) {
      setFormError(parsed.error);
      return;
    }
    const selectedProjectId = projectId || parsed.projectId;
    if (!selectedProjectId) {
      setFormError("Choose a project");
      return;
    }
    submittingRef.current = true;
    setBusy(true);
    setFormError(null);
    try {
      const res = await fetch("/api/office/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...parsed, projectId: selectedProjectId }),
      });
      if (!res.ok) throw new Error(await apiError(res));
      toast.success("Reminder scheduled");
      resetFormSafely(form);
      onOpenChange(false);
      await onCreated?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not create reminder";
      setFormError(message);
      toast.error(message);
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={createReminder} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>New reminder</DialogTitle>
            <DialogDescription>
              Schedule an email alert and choose who should receive it.
            </DialogDescription>
          </DialogHeader>

          {projectId ? (
            <input type="hidden" name="projectId" value={projectId} />
          ) : (
            <div className="grid gap-1.5">
              <Label htmlFor="reminder-project">Project</Label>
              <select
                id="reminder-project"
                name="projectId"
                required
                disabled={loadingProjects || busy}
                className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-base"
                defaultValue=""
              >
                <option value="" disabled>
                  {loadingProjects ? "Loading projects…" : "Select a project"}
                </option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="reminder-title">Title</Label>
            <Input id="reminder-title" name="title" required maxLength={160} placeholder="Follow up on site photos" />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="reminder-message">Message</Label>
            <Textarea
              id="reminder-message"
              name="message"
              rows={4}
              maxLength={5000}
              placeholder="What should this reminder say?"
              className="min-h-24 text-sm"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="reminder-scheduled-at">Send at</Label>
              <Input
                id="reminder-scheduled-at"
                name="scheduledAt"
                type="datetime-local"
                required
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="reminder-recurrence">Repeat</Label>
              <select
                id="reminder-recurrence"
                name="recurrence"
                className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-base"
                defaultValue="ONE_TIME"
              >
                <option value="ONE_TIME">One time</option>
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
              </select>
            </div>
          </div>

          <fieldset className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <legend className="px-1 text-sm font-medium text-slate-700">Send to</legend>
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" name="includeAllEmployees" className="mt-1 h-4 w-4 rounded border-slate-300" />
              <span>
                <span className="font-medium">All employees</span>
                <span className="block text-xs text-slate-500">Every active employee with an email or in-app alerts</span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" name="includeAllCustomers" className="mt-1 h-4 w-4 rounded border-slate-300" />
              <span>
                <span className="font-medium">All customers</span>
                <span className="block text-xs text-slate-500">Customers who have an email on file</span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" name="includeOwner" className="mt-1 h-4 w-4 rounded border-slate-300" />
              <span>
                <span className="font-medium">Project owner</span>
                <span className="block text-xs text-slate-500">The employee assigned to this project</span>
              </span>
            </label>
            <div className="grid gap-1.5 pt-1">
              <Label htmlFor="reminder-emails">Specific emails</Label>
              <Textarea
                id="reminder-emails"
                name="emails"
                rows={2}
                placeholder="name@example.com, another@example.com"
                className="min-h-16 text-sm"
              />
            </div>
          </fieldset>

          <input type="hidden" name="timezone" value="America/Chicago" />
          <input type="hidden" name="intervalCount" value="1" />
          <input type="hidden" name="sendBeforeMinutes" value="0" />

          {formError ? (
            <p className="text-sm text-red-600" role="alert">
              {formError}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || loadingProjects}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {busy ? "Scheduling…" : "Schedule reminder"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
