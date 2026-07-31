"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { CUSTOMER_CONFIGURABLE_MODULES, type AppModuleKey } from "@/lib/modules";

export function EmployeeModuleAccess({
  employeeId,
  licensed,
  initial,
}: {
  employeeId: string;
  licensed: Record<AppModuleKey, boolean>;
  initial: Record<AppModuleKey, boolean>;
}) {
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const response = await fetch(`/api/employees/${employeeId}/modules`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modules: CUSTOMER_CONFIGURABLE_MODULES.map(({ key }) => ({ module: key, enabled: values[key] })) }),
    });
    setSaving(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      toast.error(body.error || "Could not save employee access");
      return;
    }
    toast.success("Employee access updated");
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {CUSTOMER_CONFIGURABLE_MODULES.map(({ key, name }) => (
          <label key={key} className="flex items-center justify-between rounded-lg border p-3 text-sm">
            <span>{name}{!licensed[key] ? <span className="ml-2 text-xs text-slate-400">Not licensed</span> : null}</span>
            <Switch
              checked={licensed[key] && values[key]}
              disabled={!licensed[key] || saving}
              onCheckedChange={(enabled) => setValues((current) => ({ ...current, [key]: enabled }))}
            />
          </label>
        ))}
      </div>
      <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save app access"}</Button>
    </div>
  );
}
