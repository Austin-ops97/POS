"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Check, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/dashboard/empty-state";
import { formatDate } from "@/lib/utils";
import { LONG_SHIFT_HOURS } from "@/lib/workforce/timesheet-flags";

type TimeEntryRow = {
  id: string;
  clockIn: string;
  clockOut: string | null;
  status: string;
  workedHours: number;
  flags: string[];
  employee: { id: string; name: string; managerId?: string | null };
  location?: { id: string; name: string } | null;
  pendingEdit?: {
    id: string;
    proposedClockIn: string;
    proposedClockOut: string | null;
    reason: string;
  } | null;
};

type EditRequest = {
  id: string;
  status: string;
  reason: string;
  denialReason?: string | null;
  originalClockIn: string;
  originalClockOut: string | null;
  proposedClockIn: string;
  proposedClockOut: string | null;
  employee: { id: string; name: string; managerId?: string | null };
  timeEntry: { id: string; clockIn: string; clockOut: string | null; status: string };
};

type TimesheetsPanelProps = {
  canApprove: boolean;
  currentEmployeeId: string;
};

function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(value: string): string {
  return new Date(value).toISOString();
}

export function TimesheetsPanel({ canApprove, currentEmployeeId }: TimesheetsPanelProps) {
  const router = useRouter();
  const [entries, setEntries] = useState<TimeEntryRow[]>([]);
  const [editRequests, setEditRequests] = useState<EditRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<TimeEntryRow | null>(null);
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [denyId, setDenyId] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [entriesRes, editsRes] = await Promise.all([
        fetch("/api/workforce/time-entries"),
        fetch("/api/workforce/time-entry-edits"),
      ]);
      if (entriesRes.ok) setEntries(await entriesRes.json());
      if (editsRes.ok) setEditRequests(await editsRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openEdit(entry: TimeEntryRow) {
    setEditing(entry);
    setClockIn(toLocalInputValue(entry.clockIn));
    setClockOut(toLocalInputValue(entry.clockOut));
    setReason("");
  }

  async function submitEdit() {
    if (!editing || !clockIn || !reason.trim()) {
      toast.error("Clock in and a reason are required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/workforce/time-entry-edits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timeEntryId: editing.id,
          clockIn: fromLocalInputValue(clockIn),
          clockOut: clockOut ? fromLocalInputValue(clockOut) : null,
          reason: reason.trim(),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to submit edit");
        return;
      }
      toast.success("Edit submitted for manager approval");
      setEditing(null);
      await load();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function review(
    id: string,
    status: "APPROVED" | "DENIED" | "CANCELLED",
    denial?: string
  ) {
    const res = await fetch(`/api/workforce/time-entry-edits/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, denialReason: denial }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      toast.error(data?.error ?? "Failed to update request");
      return;
    }
    toast.success(
      status === "APPROVED"
        ? "Timesheet edit approved"
        : status === "DENIED"
          ? "Timesheet edit denied"
          : "Edit request cancelled"
    );
    setDenyId(null);
    setDenyReason("");
    await load();
    router.refresh();
  }

  const flagged = entries.filter((e) => e.flags.length > 0);
  const pending = editRequests.filter((r) => r.status === "PENDING");
  const history = editRequests.filter((r) => r.status !== "PENDING");

  function statusVariant(status: string) {
    switch (status) {
      case "APPROVED":
      case "COMPLETED":
        return "success" as const;
      case "DENIED":
        return "destructive" as const;
      case "PENDING":
      case "ACTIVE":
        return "warning" as const;
      case "ADJUSTED":
        return "secondary" as const;
      default:
        return "secondary" as const;
    }
  }

  function EntriesTable({ items }: { items: TimeEntryRow[] }) {
    if (loading) {
      return (
        <div className="space-y-3 p-4" aria-busy="true" aria-label="Loading">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      );
    }
    if (items.length === 0) {
      return (
        <div className="p-4">
          <EmptyState
            icon={Pencil}
            title="No time entries"
            description="Clocked shifts will appear here so you can review hours and request edits."
          />
        </div>
      );
    }
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
              {canApprove && <th className="px-4 py-3 font-medium">Employee</th>}
              <th className="px-4 py-3 font-medium">Clock In</th>
              <th className="px-4 py-3 font-medium">Clock Out</th>
              <th className="px-4 py-3 font-medium">Hours</th>
              <th className="px-4 py-3 font-medium">Flags</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((entry) => {
              const isOwn = entry.employee.id === currentEmployeeId;
              const canRequestEdit =
                isOwn &&
                entry.status !== "ACTIVE" &&
                !entry.pendingEdit;
              return (
                <tr key={entry.id} className="border-b border-slate-100 align-top">
                  {canApprove && (
                    <td className="px-4 py-3 font-medium">{entry.employee.name}</td>
                  )}
                  <td className="px-4 py-3 text-slate-600">{formatDate(entry.clockIn)}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {entry.clockOut ? formatDate(entry.clockOut) : "—"}
                  </td>
                  <td className="px-4 py-3">{entry.workedHours.toFixed(2)}h</td>
                  <td className="px-4 py-3">
                    {entry.flags.length === 0 ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {entry.flags.map((flag) => (
                          <Badge key={flag} variant="warning" className="gap-1">
                            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                            {flag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={statusVariant(entry.status)}>{entry.status}</Badge>
                    {entry.pendingEdit && (
                      <Badge variant="warning" className="ml-2">
                        Edit pending
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {canRequestEdit && (
                      <Button size="sm" variant="outline" onClick={() => openEdit(entry)}>
                        <Pencil className="h-3 w-3" aria-hidden="true" />
                        Request edit
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  function RequestsTable({ items }: { items: EditRequest[] }) {
    if (loading) {
      return (
        <div className="space-y-3 p-4" aria-busy="true" aria-label="Loading">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      );
    }
    if (items.length === 0) {
      return (
        <div className="p-4">
          <EmptyState
            icon={Check}
            title="No edit requests"
            description="Employee timesheet edits awaiting approval will show up here."
          />
        </div>
      );
    }
    return (
      <ul className="space-y-3 p-4">
        {items.map((req) => {
          const isOwn = req.employee.id === currentEmployeeId;
          return (
            <li
              key={req.id}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">{req.employee.name}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {formatDate(req.originalClockIn)}
                    {req.originalClockOut ? ` – ${formatDate(req.originalClockOut)}` : " (open)"}
                    {" → "}
                    {formatDate(req.proposedClockIn)}
                    {req.proposedClockOut ? ` – ${formatDate(req.proposedClockOut)}` : " (open)"}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">{req.reason}</p>
                  {req.denialReason && (
                    <p className="mt-1 text-sm text-red-600">Denied: {req.denialReason}</p>
                  )}
                </div>
                <Badge variant={statusVariant(req.status)}>{req.status}</Badge>
              </div>
              {req.status === "PENDING" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {(canApprove || req.employee.managerId === currentEmployeeId) && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => review(req.id, "APPROVED")}>
                        <Check className="h-3 w-3" aria-hidden="true" />
                        Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setDenyId(req.id)}>
                        <X className="h-3 w-3" aria-hidden="true" />
                        Deny
                      </Button>
                    </>
                  )}
                  {isOwn && (
                    <Button size="sm" variant="ghost" onClick={() => review(req.id, "CANCELLED")}>
                      Cancel
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Shifts open or lasting longer than {LONG_SHIFT_HOURS} hours are flagged. Employees can
        request timesheet edits; managers approve before hours change.
      </p>

      <Card>
        <CardContent className="p-0">
          <Tabs defaultValue={canApprove && pending.length > 0 ? "pending" : "entries"}>
            <TabsList className="m-4">
              <TabsTrigger value="entries">Entries ({entries.length})</TabsTrigger>
              <TabsTrigger value="flagged">
                Flags ({flagged.length})
              </TabsTrigger>
              <TabsTrigger value="pending">
                Pending edits ({pending.length})
              </TabsTrigger>
              <TabsTrigger value="history">Edit history ({history.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="entries" className="mt-0">
              <EntriesTable items={entries} />
            </TabsContent>
            <TabsContent value="flagged" className="mt-0">
              <EntriesTable items={flagged} />
            </TabsContent>
            <TabsContent value="pending" className="mt-0">
              <RequestsTable items={pending} />
            </TabsContent>
            <TabsContent value="history" className="mt-0">
              <RequestsTable items={history} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
          <Card className="flex max-h-[min(92dvh,100%)] w-full max-w-md flex-col overflow-hidden rounded-b-none rounded-t-2xl pb-[env(safe-area-inset-bottom)] sm:max-h-[min(90dvh,900px)] sm:rounded-xl sm:pb-0">
            <CardContent className="space-y-4 overflow-y-auto pt-6">
              <h3 className="text-lg font-semibold">Request timesheet edit</h3>
              <p className="text-sm text-slate-500">
                Your manager will need to approve this change before it applies.
              </p>
              <label className="block text-sm font-medium">
                Clock in
                <Input
                  type="datetime-local"
                  className="mt-1"
                  value={clockIn}
                  onChange={(e) => setClockIn(e.target.value)}
                />
              </label>
              <label className="block text-sm font-medium">
                Clock out
                <Input
                  type="datetime-local"
                  className="mt-1"
                  value={clockOut}
                  onChange={(e) => setClockOut(e.target.value)}
                />
              </label>
              <label className="block text-sm font-medium">
                Reason
                <textarea
                  className="mt-1 w-full rounded-md border border-slate-200 p-3 text-sm"
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why does this entry need to change?"
                />
              </label>
              <div className="flex gap-2 pb-2 sm:pb-0">
                <Button disabled={submitting} onClick={submitEdit}>
                  {submitting ? "Submitting..." : "Submit for approval"}
                </Button>
                <Button variant="outline" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {denyId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
          <Card className="flex max-h-[min(92dvh,100%)] w-full max-w-md flex-col overflow-hidden rounded-b-none rounded-t-2xl pb-[env(safe-area-inset-bottom)] sm:max-h-[min(90dvh,900px)] sm:rounded-xl sm:pb-0">
            <CardContent className="space-y-4 overflow-y-auto pt-6">
              <h3 className="text-lg font-semibold">Deny timesheet edit</h3>
              <textarea
                className="w-full rounded-md border border-slate-200 p-3 text-sm"
                placeholder="Reason for denial..."
                rows={3}
                value={denyReason}
                onChange={(e) => setDenyReason(e.target.value)}
              />
              <div className="flex gap-2 pb-2 sm:pb-0">
                <Button
                  variant="destructive"
                  disabled={!denyReason.trim()}
                  onClick={() => review(denyId, "DENIED", denyReason)}
                >
                  Confirm Denial
                </Button>
                <Button variant="outline" onClick={() => setDenyId(null)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
