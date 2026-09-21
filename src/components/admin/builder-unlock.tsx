"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function BuilderUnlock({ configured }: { configured: boolean }) {
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    const submitted = secret;
    setSecret("");
    const response = await fetch("/api/builder/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: submitted }),
    });
    setPending(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error || "Unlock failed.");
      return;
    }
    window.location.assign("/admin/builder");
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">EmeraldOne Builder</h1>
        <p className="mt-1 text-sm text-slate-500">
          Platform administrators enter the unlock secret once per session. It is checked on the server and is not stored in the browser after this form.
        </p>
      </div>
      {configured ? (
        <form onSubmit={onSubmit} className="space-y-4 rounded-lg border bg-white p-4">
          <div className="space-y-2">
            <Label htmlFor="builder-secret">Unlock secret</Label>
            <Input
              id="builder-secret"
              type="password"
              name="builder-secret"
              autoComplete="off"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              required
            />
          </div>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <Button type="submit" disabled={pending}>
            {pending ? "Checking…" : "Unlock Builder"}
          </Button>
        </form>
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          Builder unlock is not configured. Set <code className="font-mono">BUILDER_UNLOCK_SECRET</code> to a random string of at least 16 characters, then restart the app.
        </div>
      )}
      <Link href="/admin" className="text-sm text-slate-500 hover:text-slate-900">
        Back to businesses
      </Link>
    </div>
  );
}
