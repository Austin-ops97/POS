"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export type SecuritySettingsValues = {
  requirePinAtRegister: boolean;
  requireManagerPinRefund: boolean;
  requireManagerRefund: boolean;
  sessionTimeoutMinutes: number;
};

type SecuritySettingsFormProps = {
  initial: SecuritySettingsValues;
};

export function SecuritySettingsForm({ initial }: SecuritySettingsFormProps) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/business/security", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to save security settings");
        return;
      }
      toast.success("Security settings saved");
      router.refresh();
    } catch {
      toast.error("Failed to save security settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <Label htmlFor="requirePinAtRegister">PIN required at register</Label>
          <p className="mt-1 text-sm text-slate-500">
            Cashiers must enter an employee PIN before using the register.
          </p>
        </div>
        <Switch
          id="requirePinAtRegister"
          checked={values.requirePinAtRegister}
          onCheckedChange={(checked) =>
            setValues((v) => ({ ...v, requirePinAtRegister: checked }))
          }
        />
      </div>

      <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <Label htmlFor="requireManagerPinRefund">Manager PIN for refunds</Label>
          <p className="mt-1 text-sm text-slate-500">
            Require a manager PIN when processing refunds.
          </p>
        </div>
        <Switch
          id="requireManagerPinRefund"
          checked={values.requireManagerPinRefund}
          onCheckedChange={(checked) =>
            setValues((v) => ({ ...v, requireManagerPinRefund: checked }))
          }
        />
      </div>

      <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <Label htmlFor="requireManagerRefund">Manager approval for refunds</Label>
          <p className="mt-1 text-sm text-slate-500">
            Block refunds unless a manager approves them.
          </p>
        </div>
        <Switch
          id="requireManagerRefund"
          checked={values.requireManagerRefund}
          onCheckedChange={(checked) =>
            setValues((v) => ({ ...v, requireManagerRefund: checked }))
          }
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="sessionTimeoutMinutes">Register session timeout (minutes)</Label>
        <Input
          id="sessionTimeoutMinutes"
          type="number"
          min={5}
          max={480}
          value={values.sessionTimeoutMinutes}
          onChange={(e) =>
            setValues((v) => ({
              ...v,
              sessionTimeoutMinutes: Math.max(
                5,
                Math.min(480, parseInt(e.target.value || "30", 10))
              ),
            }))
          }
          className="max-w-[12rem]"
        />
        <p className="text-sm text-slate-500">
          How long a cashier PIN unlock lasts on the register.
        </p>
      </div>

      <p className="text-xs text-slate-500">
        Dashboard login is managed through Clerk. Employee PINs are set per staff
        member under Employees.
      </p>

      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save security settings"}
      </Button>
    </form>
  );
}
