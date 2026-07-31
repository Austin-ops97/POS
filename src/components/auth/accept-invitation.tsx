"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function AcceptInvitation({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function accept() {
    setLoading(true);
    const response = await fetch("/api/invitations/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const body = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) return setError(body.error || "Could not accept invitation");
    router.replace("/dashboard");
    router.refresh();
  }
  return <div className="space-y-4"><Button className="w-full" onClick={accept} disabled={loading}>{loading ? "Joining…" : "Accept invitation"}</Button>{error ? <p className="text-sm text-red-600">{error}</p> : null}</div>;
}
