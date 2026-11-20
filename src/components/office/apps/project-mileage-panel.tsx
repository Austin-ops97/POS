"use client";

import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { OfficeWorkspaceRecordSummary } from "@/lib/office/workspace-service";

export function ProjectMileagePanel({
  project,
  defaultOrigin,
  onSaved,
}: {
  project: OfficeWorkspaceRecordSummary;
  defaultOrigin: string;
  onSaved: (record: OfficeWorkspaceRecordSummary) => void;
}) {
  const meta = project.metadata ?? {};
  const [origin, setOrigin] = useState(
    typeof meta.originAddress === "string" && meta.originAddress ? meta.originAddress : defaultOrigin
  );
  const [destination, setDestination] = useState(
    typeof meta.destinationAddress === "string" ? meta.destinationAddress : ""
  );
  const miles = typeof meta.mileageMiles === "number" ? meta.mileageMiles : null;
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`/api/office/projects/${project.id}/mileage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin, destination }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Could not calculate driving distance");
      onSaved(body.record as OfficeWorkspaceRecordSummary);
      toast.success(`${body.miles} miles saved`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not calculate driving distance");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="font-semibold text-slate-900">Mileage</h3>
      <p className="mt-1 text-xs text-slate-500">Enter US addresses and calculate driving distance when you are ready.</p>
      <div className="mt-3 grid gap-3">
        <label className="text-sm font-medium">
          Origin
          <Input className="mt-1" value={origin} onChange={(e) => setOrigin(e.target.value)} required autoComplete="off" />
        </label>
        <label className="text-sm font-medium">
          Destination
          <Input className="mt-1" value={destination} onChange={(e) => setDestination(e.target.value)} required autoComplete="off" />
        </label>
        {miles != null ? <p className="text-sm text-slate-600">{miles} driving miles</p> : null}
        <Button type="submit" disabled={busy}>
          {busy ? "Calculating…" : "Calculate driving distance"}
        </Button>
      </div>
    </form>
  );
}
