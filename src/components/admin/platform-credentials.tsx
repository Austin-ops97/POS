"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Field = {
  key: string;
  label: string;
  secret: boolean;
  managed: boolean;
  configured: boolean;
  source: "vault" | "environment" | "missing";
  hint: string | null;
  value: string | null;
  updatedAt: string | null;
  input: "secret" | "text" | "choice";
  choices: string[] | null;
};

type ProviderCard = {
  id: string;
  label: string;
  summary: string;
  configured: boolean;
  missing: string[];
  updatedAt: string | null;
  suggestedRedirect: string | null;
  whitelistRedirect: string | null;
  suggestedWebhook: string | null;
  environment: string | null;
  fields: Field[];
};

type AuditRow = {
  id: string;
  action: string;
  actorEmail: string | null;
  createdAt: string;
  details: unknown;
};

type Catalog = {
  masterKey: "ok" | "missing" | "invalid";
  appOrigin: string | null;
  providers: ProviderCard[];
  audit: AuditRow[];
};

function draftId(providerId: string, fieldKey: string) {
  return `${providerId}:${fieldKey}`;
}

function draftsFromCatalog(catalog: Catalog): Record<string, string> {
  const next: Record<string, string> = {};
  for (const provider of catalog.providers) {
    for (const field of provider.fields) {
      if (field.managed || field.input === "secret") continue;
      if (field.input === "choice") next[draftId(provider.id, field.key)] = field.value || field.choices?.[0] || "";
      else next[draftId(provider.id, field.key)] = field.value || provider.suggestedRedirect || "";
    }
  }
  return next;
}

function sourceLabel(source: Field["source"]) {
  if (source === "vault") return "Vault";
  if (source === "environment") return "Host environment";
  return "Not set";
}

async function readError(response: Response) {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error || "Request failed";
}

export function PlatformCredentials() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const applyCatalog = useCallback((next: Catalog) => {
    setCatalog(next);
    setDrafts(draftsFromCatalog(next));
  }, []);

  const load = useCallback(async () => {
    const response = await fetch("/api/builder/credentials");
    if (!response.ok) {
      toast.error(await readError(response));
      return;
    }
    applyCatalog((await response.json()) as Catalog);
  }, [applyCatalog]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(provider: ProviderCard) {
    const values: Record<string, string> = {};
    for (const field of provider.fields) {
      if (field.managed) continue;
      const draft = drafts[draftId(provider.id, field.key)]?.trim() ?? "";
      if (!draft) continue;
      values[field.key] = draft;
    }
    setBusy(provider.id);
    const response = await fetch("/api/builder/credentials", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: provider.id, values }),
    });
    setBusy(null);
    if (!response.ok) {
      toast.error(await readError(response));
      return;
    }
    applyCatalog((await response.json()) as Catalog);
    toast.success(`${provider.label} saved`);
  }

  async function clear(provider: ProviderCard) {
    const confirmed = window.confirm(
      `Clear ${provider.label} app credentials from the vault? Token encryption keys stay so existing connections can still be opened. A host environment value, if one is still set, will be used again.`
    );
    if (!confirmed) return;
    setBusy(`clear-${provider.id}`);
    const response = await fetch(`/api/builder/credentials?provider=${encodeURIComponent(provider.id)}`, { method: "DELETE" });
    setBusy(null);
    if (!response.ok) {
      toast.error(await readError(response));
      return;
    }
    applyCatalog((await response.json()) as Catalog);
    toast.success(`${provider.label} cleared`);
  }

  if (!catalog) {
    return <p className="text-sm text-slate-500">Loading platform credentials…</p>;
  }

  const locked = catalog.masterKey !== "ok";

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <p className="font-medium text-slate-900">Stored encrypted in the database. Not written to Vercel.</p>
        <p className="mt-1">
          Paste each provider&apos;s app id and secret here once. Connect buttons read this vault first, then any host variable that is still set.
          Leave a secret blank to keep the current value. Redirect URIs and environments are shown in full. Secrets are not.
        </p>
        <p className="mt-2 text-slate-500">
          One-time host variables: <code>BUILDER_UNLOCK_SECRET</code>, <code>PLATFORM_ADMIN_EMAILS</code>, and <code>CREDENTIALS_ENCRYPTION_KEY</code> (32 bytes, base64).
          Database, Clerk, and Stripe keys stay in the host environment.
        </p>
      </div>

      {catalog.masterKey !== "ok" ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          {catalog.masterKey === "invalid"
            ? "CREDENTIALS_ENCRYPTION_KEY is set but is not 32 bytes of base64. Generate one with openssl rand -base64 32 and add it in the host environment, then redeploy once."
            : "Set CREDENTIALS_ENCRYPTION_KEY in the host environment before saving. It is the only encryption key these provider secrets need. Generate it with openssl rand -base64 32."}
        </div>
      ) : null}

      {!catalog.appOrigin ? (
        <p className="text-sm text-slate-500">
          Set <code>NEXT_PUBLIC_APP_URL</code> to suggest redirect URIs. You can still paste a full callback URL.
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {catalog.providers.map((provider) => (
          <form
            key={provider.id}
            className="space-y-3 rounded-lg border bg-white p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void save(provider);
            }}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-medium text-slate-900">{provider.label}</h2>
                <p className="text-sm text-slate-500">{provider.summary}</p>
              </div>
              <Badge variant={provider.configured ? "success" : "warning"}>
                {provider.configured ? "Configured" : "Needs credentials"}
              </Badge>
            </div>
            {provider.updatedAt ? (
              <p className="text-xs text-slate-500">Last updated {new Date(provider.updatedAt).toLocaleString()}</p>
            ) : null}
            {provider.environment ? (
              <p className="text-xs text-slate-500">Environment in use: {provider.environment}</p>
            ) : null}
            {provider.whitelistRedirect ? (
              <div className="rounded-md bg-slate-50 p-2 text-xs text-slate-700">
                <p className="font-medium text-slate-800">Whitelist this redirect URI</p>
                <p className="mt-1 break-all font-mono">{provider.whitelistRedirect}</p>
                {provider.id === "plaid" ? (
                  <p className="mt-1">
                    Add that exact URI under Plaid → Allowed redirect URIs before an OAuth bank can finish Link.
                    Saving here stores it in the vault with the client id and secret.
                  </p>
                ) : null}
              </div>
            ) : null}
            {provider.suggestedWebhook ? (
              <div className="rounded-md bg-slate-50 p-2 text-xs text-slate-700">
                <p className="font-medium text-slate-800">Plaid webhook URL</p>
                <p className="mt-1 break-all font-mono">{provider.suggestedWebhook}</p>
                <p className="mt-1">
                  EmeraldOne sends this when Link starts and when a bank connects. Register the same URL in the Plaid dashboard if you keep a team webhook there.
                  Manual sync still imports transactions when Plaid cannot reach this host.
                </p>
              </div>
            ) : provider.id === "plaid" ? (
              <p className="text-xs text-slate-500">
                Set <code>NEXT_PUBLIC_APP_URL</code> to the https site origin to show the Plaid webhook URL. Connect bank and manual sync work without it.
              </p>
            ) : null}
            {!provider.configured && provider.missing.length > 0 ? (
              <p className="text-xs text-amber-800">Still needed: {provider.missing.join(", ")}</p>
            ) : null}

            {provider.fields.map((field) => {
              if (field.managed) {
                return (
                  <p key={field.key} className="text-xs text-slate-500">
                    {field.label}: {field.configured ? `stored${field.hint ? ` · ending ${field.hint}` : ""} · ${sourceLabel(field.source)}` : "generated on the first save"}.
                    Not pasted here.
                  </p>
                );
              }
              const id = `${provider.id}-${field.key}`;
              const draft = drafts[draftId(provider.id, field.key)] ?? "";
              return (
                <div key={field.key} className="space-y-1">
                  <Label htmlFor={id}>{field.label}</Label>
                  {field.input === "choice" && field.choices ? (
                    <select
                      id={id}
                      className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                      value={draft || field.choices[0]}
                      onChange={(event) => setDrafts((current) => ({ ...current, [draftId(provider.id, field.key)]: event.target.value }))}
                    >
                      {field.choices.map((choice) => (
                        <option key={choice} value={choice}>{choice}</option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      id={id}
                      type={field.input === "secret" ? "password" : "text"}
                      autoComplete="off"
                      value={draft}
                      placeholder={field.input === "secret" ? (field.configured ? "Leave blank to keep the current value" : "Paste value") : ""}
                      onChange={(event) => setDrafts((current) => ({ ...current, [draftId(provider.id, field.key)]: event.target.value }))}
                    />
                  )}
                  <p className="text-xs text-slate-500">
                    {field.configured
                      ? `${sourceLabel(field.source)}${field.hint ? ` · ending ${field.hint}` : ""}`
                      : "Not set"}
                    {field.updatedAt ? ` · ${new Date(field.updatedAt).toLocaleString()}` : ""}
                  </p>
                </div>
              );
            })}

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={locked || busy !== null}>
                {busy === provider.id ? "Saving…" : `Save ${provider.label}`}
              </Button>
              <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void clear(provider)}>
                {busy === `clear-${provider.id}` ? "Clearing…" : "Clear"}
              </Button>
            </div>
          </form>
        ))}
      </div>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="font-medium text-slate-900">Credential audit</h2>
        <p className="mt-1 text-xs text-slate-500">Who saved or cleared which keys. Secret values are not recorded.</p>
        {catalog.audit.length === 0 ? <p className="mt-3 text-sm text-slate-500">No vault writes yet.</p> : null}
        <ul className="mt-3 divide-y">
          {catalog.audit.map((event) => (
            <li key={event.id} className="py-2 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{event.action}</span>
                <span className="text-xs text-slate-500">{new Date(event.createdAt).toLocaleString()}</span>
              </div>
              <p className="text-xs text-slate-500">{event.actorEmail || "Unknown"}</p>
              {event.details ? <pre className="mt-1 overflow-auto text-xs text-slate-600">{JSON.stringify(event.details)}</pre> : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
