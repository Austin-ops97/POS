"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate } from "@/lib/utils";

type TimeOffRequest = {
  id: string;
  startDate: string;
  endDate: string;
  hoursRequested: number | string;
  type: string;
  status: string;
  notes?: string | null;
  denialReason?: string | null;
  employee: { id: string; name: string };
  reviewedBy?: { id: string; name: string } | null;
};

type TimeOffListProps = {
  canApprove: boolean;
  currentEmployeeId: string;
};

export function TimeOffList({ canApprove, currentEmployeeId }: TimeOffListProps) {
  const router = useRouter();
  const [requests, setRequests] = useState<TimeOffRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [denyId, setDenyId] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState("");

  async function loadRequests(status?: string) {
    setLoading(true);
    try {
      const url = status
        ? `/api/workforce/time-off?status=${status}`
        : "/api/workforce/time-off";
      const res = await fetch(url);
      if (res.ok) setRequests(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRequests();
  }, []);

  async function review(id: string, status: "APPROVED" | "DENIED" | "CANCELLED", reason?: string) {
    const res = await fetch(`/api/workforce/time-off/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, denialReason: reason }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      toast.error(err?.error ?? "Failed to update request");
      return;
    }
    toast.success(`Request ${status.toLowerCase()}`);
    setDenyId(null);
    setDenyReason("");
    loadRequests();
    router.refresh();
  }

  function statusVariant(status: string) {
    switch (status) {
      case "APPROVED": return "success" as const;
      case "DENIED": return "destructive" as const;
      case "PENDING": return "warning" as const;
      default: return "secondary" as const;
    }
  }

  function RequestTable({ items }: { items: TimeOffRequest[] }) {
    if (loading) {
      return <p className="p-8 text-center text-sm text-slate-500">Loading...</p>;
    }
    if (items.length === 0) {
      return <p className="p-8 text-center text-sm text-slate-500">No requests found</p>;
    }
    return (
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
            {canApprove && <th className="px-4 py-3 font-medium">Employee</th>}
            <th className="px-4 py-3 font-medium">Dates</th>
            <th className="px-4 py-3 font-medium">Type</th>
            <th className="px-4 py-3 font-medium">Hours</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((req) => (
            <tr key={req.id} className="border-b border-slate-100">
              {canApprove && (
                <td className="px-4 py-3 font-medium">{req.employee.name}</td>
              )}
              <td className="px-4 py-3 text-slate-600">
                {formatDate(req.startDate)} – {formatDate(req.endDate)}
              </td>
              <td className="px-4 py-3">{req.type}</td>
              <td className="px-4 py-3">{Number(req.hoursRequested)}h</td>
              <td className="px-4 py-3">
                <Badge variant={statusVariant(req.status)}>{req.status}</Badge>
              </td>
              <td className="px-4 py-3">
                {req.status === "PENDING" && (
                  <div className="flex gap-2">
                    {canApprove && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => review(req.id, "APPROVED")}
                        >
                          <Check className="h-3 w-3" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setDenyId(req.id)}
                        >
                          <X className="h-3 w-3" />
                          Deny
                        </Button>
                      </>
                    )}
                    {!canApprove && req.employee.id === currentEmployeeId && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => review(req.id, "CANCELLED")}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  const pending = requests.filter((r) => r.status === "PENDING");
  const history = requests.filter((r) => r.status !== "PENDING");

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button asChild>
          <Link href="/workforce/time-off/new">
            <Plus className="h-4 w-4" />
            Request Time Off
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Tabs defaultValue={canApprove && pending.length > 0 ? "pending" : "all"}>
            <TabsList className="m-4">
              {canApprove && (
                <TabsTrigger value="pending">
                  Pending ({pending.length})
                </TabsTrigger>
              )}
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
            {canApprove && (
              <TabsContent value="pending" className="mt-0">
                <RequestTable items={pending} />
              </TabsContent>
            )}
            <TabsContent value="all" className="mt-0">
              <RequestTable items={requests} />
            </TabsContent>
            <TabsContent value="history" className="mt-0">
              <RequestTable items={history} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {denyId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <CardContent className="space-y-4 pt-6">
              <h3 className="text-lg font-semibold">Deny Request</h3>
              <textarea
                className="w-full rounded-md border border-slate-200 p-3 text-sm"
                placeholder="Reason for denial..."
                rows={3}
                value={denyReason}
                onChange={(e) => setDenyReason(e.target.value)}
              />
              <div className="flex gap-2">
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
