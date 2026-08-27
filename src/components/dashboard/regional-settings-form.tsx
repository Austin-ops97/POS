"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COMMON_TIMEZONES, formatDate } from "@/lib/datetime";

export type RegionalSettingsValues = {
  displayTimezone: string;
};

type RegionalSettingsFormProps = {
  initial: RegionalSettingsValues;
};

export function RegionalSettingsForm({ initial }: RegionalSettingsFormProps) {
  const router = useRouter();
  const [displayTimezone, setDisplayTimezone] = useState(initial.displayTimezone);
  const [saving, setSaving] = useState(false);

  const preview = formatDate(new Date(), { timeZone: displayTimezone });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/business/regional", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayTimezone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to save regional settings");
        return;
      }
      toast.success("Regional settings saved");
      router.refresh();
    } catch {
      toast.error("Failed to save regional settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="displayTimezone">Display timezone</Label>
        <Select value={displayTimezone} onValueChange={setDisplayTimezone}>
          <SelectTrigger id="displayTimezone" className="max-w-md">
            <SelectValue placeholder="Select timezone" />
          </SelectTrigger>
          <SelectContent>
            {COMMON_TIMEZONES.map((tz) => (
              <SelectItem key={tz.value} value={tz.value}>
                {tz.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-slate-500">
          All dates and times across the app will be shown in this timezone.
          Location timezones still apply for workforce scheduling.
        </p>
        <p className="text-sm text-slate-600">
          Current time: <span className="font-medium">{preview}</span>
        </p>
      </div>

      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save regional settings"}
      </Button>
    </form>
  );
}
