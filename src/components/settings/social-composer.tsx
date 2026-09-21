"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { platformIssue, platformLabel, type SocialPlatformName } from "@/lib/social/plan";

type Account = {
  id: string;
  platform: SocialPlatformName;
  status: string;
  displayName: string;
  accountKind: string;
};

export function SocialComposer({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const connected = accounts.filter((account) => account.status === "CONNECTED");

  const issues = useMemo(
    () =>
      connected
        .filter((account) => selected.includes(account.id))
        .map((account) => ({
          id: account.id,
          label: `${platformLabel(account.platform)} · ${account.displayName}`,
          issue: platformIssue(account.platform, { text: body, link: linkUrl || null, hasImage: Boolean(file) }),
        })),
    [body, connected, file, linkUrl, selected],
  );
  const blocked = issues.filter((item) => item.issue);
  const allBlocked = selected.length > 0 && blocked.length === selected.length;

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function publish(mode: "now" | "schedule") {
    if (selected.length === 0) {
      setError("Select at least one connected account");
      return;
    }
    if (mode === "schedule" && !scheduledFor) {
      setError("Choose a date and time to schedule");
      return;
    }
    setBusy(mode);
    setError(null);
    const form = new FormData();
    form.set("body", body);
    form.set("linkUrl", linkUrl);
    if (mode === "schedule") form.set("scheduledFor", new Date(scheduledFor).toISOString());
    for (const id of selected) form.append("connectionId", id);
    if (file) form.set("image", file);
    const response = await fetch("/api/social/posts", { method: "POST", body: form });
    const data = await response.json().catch(() => null);
    setBusy(null);
    if (!response.ok) {
      setError(data?.error ?? "Publish failed");
      toast.error(data?.error ?? "Publish failed");
      return;
    }
    toast.success(data.status === "SCHEDULED" ? "Post scheduled" : `Finished with status ${data.status}`);
    router.push("/settings/integrations/social");
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void publish("now");
        }}
      >
        {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
        <div>
          <Label htmlFor="post-body">Text</Label>
          <textarea id="post-body" value={body} onChange={(event) => setBody(event.target.value)} rows={6} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="What should this post say?" />
          <p className="mt-1 text-xs text-slate-500">{body.trim().length} characters. Facebook 63,206 · Instagram 2,200 · LinkedIn 3,000.</p>
        </div>
        <div>
          <Label htmlFor="post-link">Link</Label>
          <Input id="post-link" className="mt-1.5" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://" />
        </div>
        <div>
          <Label htmlFor="post-image">Image</Label>
          <Input
            id="post-image"
            className="mt-1.5"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => {
              const next = event.target.files?.[0] ?? null;
              setFile(next);
              setPreviewUrl(next ? URL.createObjectURL(next) : null);
            }}
          />
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-900">Platforms</legend>
          {connected.length === 0 ? (
            <p className="text-sm text-slate-500">Publish stays off until Facebook, Instagram, or LinkedIn is connected.</p>
          ) : (
            connected.map((account) => (
              <label key={account.id} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={selected.includes(account.id)} onChange={() => toggle(account.id)} />
                {platformLabel(account.platform)} · {account.displayName} · {account.accountKind}
              </label>
            ))
          )}
        </fieldset>
        {blocked.length > 0 ? (
          <ul className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            {blocked.map((item) => (
              <li key={item.id}>{item.label}: {item.issue}</li>
            ))}
          </ul>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <Label htmlFor="post-when">Schedule</Label>
            <Input id="post-when" className="mt-1.5" type="datetime-local" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} />
          </div>
          <Button type="button" variant="outline" disabled={busy !== null || connected.length === 0 || allBlocked} onClick={() => void publish("schedule")}>
            {busy === "schedule" ? "Scheduling…" : "Schedule"}
          </Button>
        </div>
        {connected.length > 0 ? (
          <Button type="submit" disabled={busy !== null || allBlocked || selected.length === 0}>
            {busy === "now" ? "Publishing…" : selected.length ? `Publish to ${selected.length} platform${selected.length === 1 ? "" : "s"}` : "Publish"}
          </Button>
        ) : null}
        <p className="text-xs text-slate-500">One platform can fail without cancelling the others. Retry a failed platform from publishing history. Scheduled posts go out on the existing reminders job, and also when this page is opened after the time has passed.</p>
      </form>
      <aside className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-900">Preview</h2>
        <div className="mt-3 space-y-3">
          {selected.length === 0 ? <p className="text-sm text-slate-500">Select platforms to preview where this post will go.</p> : null}
          {connected.filter((account) => selected.includes(account.id)).map((account) => (
            <article key={account.id} className="rounded-xl border border-slate-100 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{platformLabel(account.platform)} · {account.displayName}</p>
              {previewUrl ? <div role="img" aria-label="Selected image" className="mt-2 h-48 rounded-lg bg-slate-100 bg-cover bg-center" style={{ backgroundImage: `url(${previewUrl})` }} /> : null}
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-900">{body || "Your text will appear here."}</p>
              {linkUrl ? <p className="mt-1 text-sm text-emerald-700">{linkUrl}</p> : null}
            </article>
          ))}
        </div>
      </aside>
    </div>
  );
}
