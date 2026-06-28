"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type TaxRateFormProps = {
  locationId?: string | null;
};

export function TaxRateForm({ locationId }: TaxRateFormProps) {
  const router = useRouter();
  const [name, setName] = useState("Sales Tax");
  const [ratePercent, setRatePercent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const rate = parseFloat(ratePercent);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      toast.error("Enter a valid tax rate between 0 and 100");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/tax-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          rate: rate / 100,
          locationId: locationId || undefined,
          appliesToProducts: true,
          appliesToServices: true,
          isActive: true,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast.error(err?.error ?? "Failed to save tax rate");
        return;
      }
      toast.success("Tax rate saved");
      setRatePercent("");
      router.refresh();
    } catch {
      toast.error("Failed to save tax rate");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add Tax Rate</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="space-y-2 sm:flex-1">
            <Label htmlFor="tax-name">Name</Label>
            <Input
              id="tax-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2 sm:w-40">
            <Label htmlFor="tax-rate">Rate (%)</Label>
            <Input
              id="tax-rate"
              type="number"
              step="0.001"
              min="0"
              max="100"
              placeholder="8.25"
              value={ratePercent}
              onChange={(e) => setRatePercent(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving..." : "Add Rate"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
