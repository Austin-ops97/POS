"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { AppModuleKey } from "@/lib/modules";

export function BusinessControl({
  id,
  initialStatus,
  initialModules,
}: {
  id: string;
  initialStatus: "ACTIVE" | "SUSPENDED";
  initialModules: Record<AppModuleKey, boolean>;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [saving, setSaving] = useState(false);
  const enabled = Object.values(initialModules).filter(Boolean).length;
  const total = Object.keys(initialModules).length;

  async function saveStatus() {
    setSaving(true);
    const response = await fetch(`/api/platform/businesses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setSaving(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      toast.error(body.error || "Could not update business");
      return;
    }
    toast.success("Business status updated");
  }

  return (
    <div className="space-y-6">
      <label className="flex items-center justify-between rounded-lg border p-4">
        <span>
          <span className="block font-medium">Business active</span>
          <span className="text-sm text-slate-500">Suspending blocks all employee access.</span>
        </span>
        <Switch checked={status === "ACTIVE"} onCheckedChange={(active) => setStatus(active ? "ACTIVE" : "SUSPENDED")} />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
        <div>
          <p className="font-medium">Feature licensing</p>
          <p className="text-sm text-slate-500">
            {enabled} of {total} modules are on. Plans, overrides, and connections are in Builder.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/admin/builder?business=${id}`}>Open in Builder</Link>
        </Button>
      </div>
      <Button onClick={saveStatus} disabled={saving}>
        {saving ? "Saving…" : "Save status"}
      </Button>
    </div>
  );
}
