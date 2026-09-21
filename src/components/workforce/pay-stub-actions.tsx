"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function PrintStubButton() {
  return (
    <Button type="button" variant="outline" className="print:hidden" onClick={() => window.print()}>
      Print
    </Button>
  );
}

export function VoidPayrollButton({ runId }: { runId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function voidRun() {
    const confirmed = window.confirm(
      "Void this payroll run? Stored amounts stay on file, and the run is left out of YTD and tax reports."
    );
    if (!confirmed) return;
    setPending(true);
    setError(null);
    const res = await fetch(`/api/workforce/payroll/runs/${runId}/void`, { method: "POST" });
    setPending(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const message = body?.error ?? "Could not void this payroll run";
      setError(message);
      toast.error(message);
      return;
    }
    toast.success("Payroll run voided");
    router.refresh();
  }

  return (
    <div className="space-y-1">
      <Button type="button" variant="outline" disabled={pending} onClick={voidRun}>
        {pending ? "Voiding..." : "Void run"}
      </Button>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
