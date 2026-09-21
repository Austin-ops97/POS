"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { platformLabel, type SocialPlatformName } from "@/lib/social/plan";

type Account = {
  id: string;
  platform: SocialPlatformName;
  status: string;
  displayName: string;
  accountKind: string;
  externalId: string;
  lastSyncAt: string | null;
  lastSyncError: string | null;
};

type Delivery = {
  id: string;
  platform: SocialPlatformName;
  status: string;
  error: string | null;
  displayName: string;
};

type Post = {
  id: string;
  body: string;
  linkUrl: string | null;
  hasImage: boolean;
  status: string;
  scheduledFor: string | null;
  createdAt: string;
  deliveries: Delivery[];
};

const PLATFORMS: SocialPlatformName[] = ["FACEBOOK", "INSTAGRAM", "LINKEDIN"];

export function SocialCenter({
  meta,
  linkedin,
  accounts,
  posts,
  notice,
}: {
  meta: { ready: boolean; missing: string[] };
  linkedin: { ready: boolean; missing: string[] };
  accounts: Account[];
  posts: Post[];
  notice: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(notice);

  async function disconnect(id: string) {
    setBusy(id);
    const response = await fetch("/api/integrations/social/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId: id }),
    });
    const data = await response.json().catch(() => null);
    setBusy(null);
    if (!response.ok) {
      setError(data?.error ?? "Could not disconnect");
      return;
    }
    toast.success("Account disconnected");
    router.refresh();
  }

  async function refresh(id: string) {
    setBusy(`refresh-${id}`);
    const response = await fetch("/api/integrations/social/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId: id }),
    });
    const data = await response.json().catch(() => null);
    setBusy(null);
    if (!response.ok) {
      setError(data?.error ?? "Could not refresh");
      router.refresh();
      return;
    }
    toast.success("Account refreshed");
    router.refresh();
  }

  async function retry(postId: string, deliveryId: string) {
    setBusy(deliveryId);
    const response = await fetch(`/api/social/posts/${postId}/retry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deliveryId }),
    });
    const data = await response.json().catch(() => null);
    setBusy(null);
    if (!response.ok) {
      setError(data?.error ?? "Retry failed");
      toast.error(data?.error ?? "Retry failed");
      return;
    }
    toast.success(data.status === "PUBLISHED" ? "Published" : data.error || "Still failed");
    router.refresh();
  }

  return (
    <div className="space-y-8">
      {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
        <p className="text-sm text-slate-600">Official OAuth only. EmeraldOne does not ask for a Facebook, Instagram, or LinkedIn password.</p>
        <Button asChild>
          <Link href="/settings/integrations/social/compose">Create social post</Link>
        </Button>
      </div>
      {PLATFORMS.map((platform) => {
        const provider = platform === "LINKEDIN" ? linkedin : meta;
        const rows = accounts.filter((account) => account.platform === platform);
        const connected = rows.some((account) => account.status === "CONNECTED");
        return (
          <section key={platform} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">{platformLabel(platform)}</p>
            <p className="text-xl font-semibold text-slate-900">{connected ? "Connected" : rows.some((account) => account.status === "ERROR") ? "Needs attention" : "Not connected"}</p>
            {platform !== "INSTAGRAM" && !provider.ready ? (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                <p className="font-semibold">Connect needs these environment variables</p>
                <ul className="mt-2 list-disc pl-5">
                  {provider.missing.map((key) => (
                    <li key={key}><code>{key}</code></li>
                  ))}
                </ul>
              </div>
            ) : null}
            {rows.length === 0 ? <p className="mt-2 text-sm text-slate-600">No {platformLabel(platform)} account is connected.</p> : (
              <ul className="mt-3 divide-y divide-slate-100">
                {rows.map((account) => (
                  <li key={account.id} className="py-3 text-sm">
                    <p className="font-medium text-slate-900">{account.displayName} · {account.accountKind} · {account.status === "CONNECTED" ? "Connected" : account.status === "ERROR" ? "Needs attention" : "Not connected"}</p>
                    <p className="text-slate-500">{account.externalId}</p>
                    {account.lastSyncAt ? <p className="text-xs text-slate-500">Last sync {account.lastSyncAt}</p> : null}
                    {account.lastSyncError ? <p className="text-red-700">{account.lastSyncError}</p> : null}
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                      {account.status === "CONNECTED" ? (
                        <Button type="button" variant="outline" disabled={busy !== null} onClick={() => refresh(account.id)}>
                          {busy === `refresh-${account.id}` ? "Refreshing…" : "Refresh"}
                        </Button>
                      ) : null}
                      {account.status !== "DISCONNECTED" ? (
                        <Button type="button" variant="outline" disabled={busy !== null} onClick={() => disconnect(account.id)}>
                          {busy === account.id ? "Disconnecting…" : "Disconnect"}
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {platform === "INSTAGRAM" ? (
              <p className="mt-3 text-sm text-slate-600">Instagram uses the Facebook connection above. A professional account linked to a Page shows up here after that authorization. Image posts also need the existing blob token because Instagram requires a public image URL.</p>
            ) : (
              <div className="mt-3">
                {provider.ready ? (
                  <Button asChild variant={connected ? "outline" : "default"}>
                    <a href={platform === "LINKEDIN" ? "/api/integrations/linkedin/connect" : "/api/integrations/meta/connect"}>
                      {connected ? "Reconnect" : platform === "LINKEDIN" ? "Connect LinkedIn" : "Connect Facebook and Instagram"}
                    </a>
                  </Button>
                ) : (
                  <Button type="button" disabled>
                    Connect {platformLabel(platform)}
                  </Button>
                )}
              </div>
            )}
          </section>
        );
      })}

      <section>
        <h2 className="text-lg font-semibold text-slate-900">Publishing history</h2>
        {posts.length === 0 ? <p className="mt-2 text-sm text-slate-500">No social posts yet.</p> : (
          <ul className="mt-3 space-y-3">
            {posts.map((post) => (
              <li key={post.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs uppercase tracking-wide text-slate-400">{post.status}{post.scheduledFor ? ` · ${post.scheduledFor}` : ""}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-900">{post.body || "Image or link post"}</p>
                {post.linkUrl ? <p className="text-sm text-emerald-700">{post.linkUrl}</p> : null}
                {post.hasImage ? <div role="img" aria-label="Attached image" className="mt-2 h-40 rounded-lg bg-slate-100 bg-cover bg-center" style={{ backgroundImage: `url(/api/social/posts/${post.id}/image)` }} /> : null}
                <ul className="mt-3 space-y-2">
                  {post.deliveries.map((delivery) => (
                    <li key={delivery.id} className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
                      <span>{platformLabel(delivery.platform)} {delivery.displayName}: {delivery.status === "PUBLISHED" ? "Published" : delivery.status === "FAILED" ? `Failed${delivery.error ? `: ${delivery.error}` : ""}` : "Scheduled"}</span>
                      {delivery.status === "FAILED" ? (
                        <Button type="button" variant="outline" disabled={busy !== null} onClick={() => retry(post.id, delivery.id)}>
                          {busy === delivery.id ? "Retrying…" : `Retry ${platformLabel(delivery.platform)}`}
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
