"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ResendInviteButton({ employeeId, email }: { employeeId: string; email: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function resend() {
    setBusy(true);
    try {
      const res = await fetch(`/api/employees/${employeeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resend-invite" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "Could not create a new invitation");
        return;
      }
      setUrl(body.invitationUrl ?? null);
      if (body.invitationUrl) {
        await navigator.clipboard.writeText(body.invitationUrl).catch(() => undefined);
        toast.success("New invitation link copied");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm text-amber-950">
        This teammate has not finished joining. Send them a new link and have them create a login as{" "}
        <span className="font-medium">{email}</span>.
      </p>
      <Button type="button" variant="outline" onClick={resend} disabled={busy}>
        {busy ? "Creating link…" : "Create new invitation link"}
      </Button>
      {url ? <Input readOnly value={url} /> : null}
    </div>
  );
}
