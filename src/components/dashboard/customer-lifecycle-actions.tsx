"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CustomerLifecycleActions({ customerId, name }: { customerId: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function archive() {
    if (!window.confirm(`Archive ${name}? Historical orders will be preserved.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/customers/${customerId}`, { method: "DELETE" });
      if (!res.ok) { const error = await res.json().catch(() => null); toast.error(error?.error ?? "Failed to archive customer"); return; }
      toast.success("Customer archived");
      router.push("/customers");
      router.refresh();
    } finally { setBusy(false); }
  }
  return <Button variant="destructive" onClick={archive} disabled={busy}>{busy ? "Archiving..." : "Archive customer"}</Button>;
}
