"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { CUSTOMER_CONFIGURABLE_MODULES, type AppModuleKey } from "@/lib/modules";

export function BusinessControl({ id, initialStatus, initialModules }: {
  id: string;
  initialStatus: "ACTIVE" | "SUSPENDED";
  initialModules: Record<AppModuleKey, boolean>;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [modules, setModules] = useState(initialModules);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const response = await fetch(`/api/platform/businesses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, modules: CUSTOMER_CONFIGURABLE_MODULES.map(({ key }) => ({ module: key, enabled: modules[key] })) }),
    });
    setSaving(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      toast.error(body.error || "Could not update business");
      return;
    }
    toast.success("Business configuration updated");
  }

  return (
    <div className="space-y-6">
      <label className="flex items-center justify-between rounded-lg border p-4">
        <span><span className="block font-medium">Business active</span><span className="text-sm text-slate-500">Suspending blocks all employee access.</span></span>
        <Switch checked={status === "ACTIVE"} onCheckedChange={(active) => setStatus(active ? "ACTIVE" : "SUSPENDED")} />
      </label>
      <div className="grid gap-3 md:grid-cols-2">
        {CUSTOMER_CONFIGURABLE_MODULES.map(({ key, name, description }) => (
          <label key={key} className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <span><span className="block font-medium">{name}</span><span className="text-sm text-slate-500">{description}</span></span>
            <Switch checked={modules[key]} onCheckedChange={(enabled) => setModules((current) => ({ ...current, [key]: enabled }))} />
          </label>
        ))}
      </div>
      <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save business configuration"}</Button>
    </div>
  );
}
