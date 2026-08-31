"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export type InvitationPreview = {
  valid: boolean;
  expired?: boolean;
  email?: string;
  businessName?: string;
  status?: string;
  alreadyJoined?: boolean;
};

export function AcceptInvitation({
  token,
  preview,
  signedInEmail,
  authEnabled,
}: {
  token: string;
  preview: InvitationPreview;
  signedInEmail: string | null;
  authEnabled: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const joinPath = `/join/${encodeURIComponent(token)}`;
  const signInHref = `/sign-in?redirect_url=${encodeURIComponent(joinPath)}`;
  const signUpHref = `/sign-up?redirect_url=${encodeURIComponent(joinPath)}`;

  async function accept() {
    setLoading(true);
    setError("");
    const response = await fetch("/api/invitations/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const body = await response.json().catch(() => ({}));
    setLoading(false);
    if (response.status === 401) {
      setError("Sign in with the invited email, then open this link again.");
      return;
    }
    if (!response.ok) return setError(body.error || "Could not accept invitation");
    router.replace("/dashboard");
    router.refresh();
  }

  useEffect(() => {
    if (!signedInEmail || !preview.valid) return;
    if (preview.alreadyJoined) {
      router.replace("/dashboard");
      return;
    }
    if (preview.email && signedInEmail.toLowerCase() !== preview.email.toLowerCase()) {
      return;
    }
    void accept();
    // Auto-accept once when the invited person is already signed in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedInEmail, preview.valid, preview.alreadyJoined, preview.email]);

  if (!preview.valid) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          This invitation is invalid or has expired. Ask a manager to send a new invite.
        </p>
        {signedInEmail ? (
          <Button className="w-full" onClick={() => router.replace("/dashboard")}>
            Go to dashboard
          </Button>
        ) : (
          <Button asChild className="w-full">
            <Link href="/sign-in">Sign in</Link>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        You are invited to join <span className="font-medium text-slate-900">{preview.businessName}</span>.
        Use the email <span className="font-medium text-slate-900">{preview.email}</span> so this link can verify your login.
      </p>
      {!signedInEmail ? (
        <>
          <p className="text-sm text-slate-600">
            Create a login with that email, or sign in if you already have one. You will come back here automatically.
          </p>
          <div className="grid gap-2">
            <Button asChild className="w-full">
              <Link href={authEnabled ? signUpHref : "/dashboard"}>Create login</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href={authEnabled ? signInHref : "/dashboard"}>Sign in</Link>
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-slate-600">
            Signed in as <span className="font-medium text-slate-900">{signedInEmail}</span>.
          </p>
          <Button className="w-full" onClick={accept} disabled={loading}>
            {loading ? "Joining…" : "Accept invitation"}
          </Button>
        </>
      )}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
