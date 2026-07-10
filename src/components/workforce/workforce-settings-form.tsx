"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { workforceSettingsSchema } from "@/lib/validations/workforce";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type FormValues = z.infer<typeof workforceSettingsSchema>;

const WEEKDAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

type WorkforceSettingsFormProps = {
  defaultValues: FormValues;
};

export function WorkforceSettingsForm({ defaultValues }: WorkforceSettingsFormProps) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(workforceSettingsSchema),
    defaultValues,
  });

  const payPeriodType = watch("payPeriodType");
  const weekStartDay = watch("weekStartDay");

  async function onSubmit(data: FormValues) {
    const res = await fetch("/api/workforce/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      toast.error(err?.error ?? "Failed to save settings");
      return;
    }

    toast.success("Workforce settings saved");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Pay Period & Overtime</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Pay period type</Label>
              <Select
                value={payPeriodType}
                onValueChange={(v) =>
                  setValue("payPeriodType", v as FormValues["payPeriodType"], {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="WEEKLY">Weekly</SelectItem>
                  <SelectItem value="BIWEEKLY">Bi-weekly</SelectItem>
                  <SelectItem value="SEMIMONTHLY">Semi-monthly</SelectItem>
                  <SelectItem value="MONTHLY">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Week starts on</Label>
              <Select
                value={String(weekStartDay)}
                onValueChange={(v) =>
                  setValue("weekStartDay", parseInt(v, 10), { shouldValidate: true })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WEEKDAYS.map((d) => (
                    <SelectItem key={d.value} value={String(d.value)}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="overtimeThresholdHours">Overtime threshold (hours/week)</Label>
              <Input
                id="overtimeThresholdHours"
                type="number"
                step="0.5"
                min="0"
                {...register("overtimeThresholdHours", { valueAsNumber: true })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="defaultPtoAnnualHours">Default annual PTO (hours)</Label>
              <Input
                id="defaultPtoAnnualHours"
                type="number"
                step="0.5"
                min="0"
                {...register("defaultPtoAnnualHours", { valueAsNumber: true })}
              />
            </div>
          </div>
        </CardContent>
      </Card>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Saving..." : "Save Settings"}
      </Button>
    </form>
  );
}
