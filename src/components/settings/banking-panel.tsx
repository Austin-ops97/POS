"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

const LINK_STORAGE_KEY = "emeraldone.plaid.link";

type Account = {
  id: string;
  name: string;
  officialName: string | null;
  mask: string | null;
  kind: string;
  currentBalance: number | null;
  availableBalance: number | null;
  lastSyncedAt: string | null;
};

type BankingPanelProps = {
  credentialsReady: boolean;
  missing: string[];
  connectMessage: string | null;
  environment: string;
  redirectUri: string | null;
  webhookUrl: string | null;
  syncPageLimit: number;
  status: string;
  institutionId: string | null;
  institutionName: string | null;
  itemId: string | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  accounts: Account[];
};

type PlaidHandler = { open: () => void; destroy?: () => void };
type InstitutionMeta = { institution?: { institution_id?: string; name?: string } | null };
type StoredLink = { linkToken: string; updateMode: boolean };

declare global {
  interface Window {
    Plaid?: {
      create: (config: {
        token: string;
        receivedRedirectUri?: string;
        onSuccess: (publicToken: string, metadata: InstitutionMeta) => void;
        onExit?: (error: { display_message?: string; error_message?: string } | null) => void;
      }) => PlaidHandler;
    };
  }
}

function loadPlaidScript(): Promise<void> {
  if (window.Plaid) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Plaid Link did not load"));
    document.body.appendChild(script);
  });
}

function rememberLink(value: StoredLink) {
  sessionStorage.setItem(LINK_STORAGE_KEY, JSON.stringify(value));
}

function readRememberedLink(): StoredLink | null {
  const raw = sessionStorage.getItem(LINK_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredLink;
    if (!parsed.linkToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function BankingPanel(props: BankingPanelProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(props.lastSyncError);
  const oauthStarted = useRef(false);
  const connected = props.status === "CONNECTED";

  async function openPlaid(linkToken: string, updateMode: boolean, receivedRedirectUri?: string) {
    await loadPlaidScript();
    if (!window.Plaid) throw new Error("Plaid Link did not load");
    rememberLink({ linkToken, updateMode });
    const handler = window.Plaid.create({
      token: linkToken,
      receivedRedirectUri,
      onSuccess: (publicToken, metadata) => {
        sessionStorage.removeItem(LINK_STORAGE_KEY);
        void finishLink(publicToken, metadata, updateMode);
      },
      onExit: (exitError) => {
        setBusy(null);
        if (exitError) setError(exitError.display_message || exitError.error_message || "Bank linking was cancelled");
      },
    });
    handler.open();
  }

  useEffect(() => {
    if (oauthStarted.current || !props.credentialsReady) return;
    const params = new URLSearchParams(window.location.search);
    if (!params.get("oauth_state_id")) return;
    oauthStarted.current = true;
    const stored = readRememberedLink();
    if (!stored) {
      setError("Bank linking expired. Start Connect bank again.");
      return;
    }
    setBusy("link");
    void openPlaid(stored.linkToken, stored.updateMode, window.location.href).catch((linkError: unknown) => {
      setBusy(null);
      const message = linkError instanceof Error ? linkError.message : "Could not resume bank linking";
      setError(message);
    });
    // Resume only on the OAuth return load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.credentialsReady]);

  async function openLink() {
    setBusy("link");
    setError(null);
    try {
      const response = await fetch("/api/integrations/plaid/link-token", { method: "POST" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.linkToken) {
        throw new Error(data?.error ?? "Plaid did not issue a link token");
      }
      await openPlaid(data.linkToken, Boolean(data.updateMode));
    } catch (linkError) {
      setBusy(null);
      const message = linkError instanceof Error ? linkError.message : "Could not open bank linking";
      setError(message);
      toast.error(message);
    }
  }

  async function finishLink(
    publicToken: string,
    metadata: { institution?: { institution_id?: string; name?: string } | null },
    updateMode: boolean,
  ) {
    const response = updateMode
      ? await fetch("/api/integrations/plaid/sync", { method: "POST" })
      : await fetch("/api/integrations/plaid/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            publicToken,
            institutionId: metadata.institution?.institution_id ?? null,
            institutionName: metadata.institution?.name ?? null,
          }),
        });
    const data = await response.json().catch(() => null);
    setBusy(null);
    if (!response.ok) {
      setError(data?.error ?? "The bank connection was not saved");
      toast.error(data?.error ?? "The bank connection was not saved");
      return;
    }
    toast.success(updateMode ? "Bank reconnected" : "Bank connected");
    router.replace("/settings/integrations/banking");
    router.refresh();
  }

  async function sync() {
    setBusy("sync");
    setError(null);
    const response = await fetch("/api/integrations/plaid/sync", { method: "POST" });
    const data = await response.json().catch(() => null);
    setBusy(null);
    if (!response.ok) {
      setError(data?.error ?? "Sync failed");
      toast.error(data?.error ?? "Sync failed");
      router.refresh();
      return;
    }
    toast.success(data.partial ? "Synced a portion of transactions. Sync again to continue." : "Transactions synced");
    router.refresh();
  }

  async function disconnect() {
    setBusy("disconnect");
    const response = await fetch("/api/integrations/plaid/disconnect", { method: "POST" });
    const data = await response.json().catch(() => null);
    setBusy(null);
    if (!response.ok) {
      setError(data?.error ?? "Could not disconnect");
      return;
    }
    toast.success("Bank disconnected");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm text-slate-500">Status</p>
        <p className="text-xl font-semibold text-slate-900">{connected ? "Connected" : props.status === "ERROR" ? "Needs attention" : "Not connected"}</p>
        {connected ? (
          <p className="mt-1 text-sm text-slate-600">
            {props.institutionName || "Bank"}{props.institutionId ? ` · ${props.institutionId}` : ""} · {props.environment}
            {props.itemId ? ` · item ${props.itemId}` : ""}
          </p>
        ) : (
          <p className="mt-1 text-sm text-slate-600">EmeraldOne stays not connected until Plaid Link finishes. Bank passwords are never entered here.</p>
        )}
        {props.connectedAt ? <p className="mt-1 text-xs text-slate-500">Connected {props.connectedAt}</p> : null}
        {props.lastSyncAt ? <p className="mt-1 text-xs text-slate-500">Last sync {props.lastSyncAt}{props.lastSyncStatus ? ` · ${props.lastSyncStatus}` : ""}</p> : null}
        {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      </div>

      {!props.credentialsReady ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-semibold">Plaid is not in the Builder vault yet</p>
          <p className="mt-2">{props.connectMessage}</p>
          {props.missing.length > 0 ? (
            <ul className="mt-2 list-disc pl-5">
              {props.missing.map((key) => (
                <li key={key}><code>{key}</code></li>
              ))}
            </ul>
          ) : null}
          <p className="mt-2">
            Open <Link className="font-medium underline" href="/admin/builder">Builder → Platform credentials</Link> and save the Plaid client ID and secret.
            The first save generates the token encryption key. Sandbox, development, or production is the environment field there. It defaults to sandbox.
            Bank passwords are never stored.
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          Plaid environment is {props.environment}, from Builder (host fallback only when the vault value is empty).
          Each sync imports at most {props.syncPageLimit} pages. If the last sync says partial, run Sync transactions again.
          Pending bank rows are skipped until they post.
          {props.redirectUri ? ` OAuth banks return to ${props.redirectUri}.` : " OAuth banks need the redirect URI saved in Builder and allowlisted in the Plaid dashboard."}
          {props.webhookUrl ? ` Transaction updates post to ${props.webhookUrl}.` : " Manual sync works without an https webhook URL."}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {props.credentialsReady && !connected ? (
          <Button type="button" disabled={busy !== null} onClick={openLink}>
            {busy === "link" ? "Opening Plaid…" : props.status === "ERROR" ? "Reconnect bank" : "Connect bank"}
          </Button>
        ) : null}
        {!props.credentialsReady ? (
          <Button type="button" disabled>
            Connect bank
          </Button>
        ) : null}
        {connected || props.status === "ERROR" ? (
          <>
            {connected ? (
              <Button type="button" disabled={busy !== null} onClick={sync}>
                {busy === "sync" ? "Syncing…" : "Sync transactions"}
              </Button>
            ) : null}
            {connected && props.credentialsReady ? (
              <Button type="button" variant="outline" disabled={busy !== null} onClick={openLink}>
                {busy === "link" ? "Opening Plaid…" : "Reconnect"}
              </Button>
            ) : null}
            <Button type="button" variant="outline" disabled={busy !== null} onClick={disconnect}>
              {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
            </Button>
          </>
        ) : (
          <p className="text-sm text-slate-500">Sync stays off until a bank is connected.</p>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold text-slate-900">Accounts</h2>
        {props.accounts.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No linked checking, savings, or credit accounts yet. A statement import can still add an account from Finance → Bank transactions.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {props.accounts.map((account) => (
              <li key={account.id} className="px-4 py-3 text-sm">
                <p className="font-medium text-slate-900">{account.name}{account.mask ? ` · ${account.mask}` : ""} · {account.kind}</p>
                <p className="text-slate-600">
                  {account.currentBalance == null ? "Balance not provided" : `Current ${formatCurrency(account.currentBalance)}`}
                  {account.availableBalance == null ? "" : ` · available ${formatCurrency(account.availableBalance)}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
