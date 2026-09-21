"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const PULL_ENTITIES = ["Customer", "Vendor", "Item", "Purchase"] as const;
const DEFERRED_ENTITIES = ["Account", "Invoice", "Payment"] as const;

type Log = {
  id: string;
  direction: string;
  entityType: string;
  status: string;
  message: string | null;
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  startedAt: string;
};

type QuickBooksPanelProps = {
  credentialsReady: boolean;
  missing: string[];
  environment: string;
  status: string;
  companyName: string | null;
  realmId: string | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  logs: Log[];
  notice: string | null;
};

export function QuickBooksPanel(props: QuickBooksPanelProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(props.notice);
  const connected = props.status === "CONNECTED";

  async function sync(entity: string) {
    setBusy(entity);
    setError(null);
    const response = await fetch("/api/integrations/quickbooks/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity }),
    });
    const data = await response.json().catch(() => null);
    setBusy(null);
    if (!response.ok) {
      setError(data?.error ?? "Sync failed");
      toast.error(data?.error ?? "Sync failed");
      return;
    }
    toast.success(`Pulled ${entity}`);
    router.refresh();
  }

  async function disconnect() {
    setBusy("disconnect");
    const response = await fetch("/api/integrations/quickbooks/disconnect", { method: "POST" });
    setBusy(null);
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.error ?? "Could not disconnect");
      return;
    }
    toast.success("QuickBooks disconnected");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm text-slate-500">Status</p>
        <p className="text-xl font-semibold text-slate-900">{connected ? "Connected" : props.status === "ERROR" ? "Needs attention" : "Not connected"}</p>
        {connected ? (
          <p className="mt-1 text-sm text-slate-600">{props.companyName || "QuickBooks company"}{props.realmId ? ` · realm ${props.realmId}` : ""} · {props.environment}</p>
        ) : (
          <p className="mt-1 text-sm text-slate-600">EmeraldOne does not show a connected state until Intuit OAuth finishes.</p>
        )}
        {props.lastSyncError ? <p className="mt-2 text-sm text-red-700">{props.lastSyncError}</p> : null}
        {props.lastSyncAt ? <p className="mt-1 text-xs text-slate-500">Last sync {props.lastSyncAt}</p> : null}
      </div>

      {!props.credentialsReady ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-semibold">Connect QuickBooks needs these environment variables</p>
          <ul className="mt-2 list-disc pl-5">
            {props.missing.map((key) => (
              <li key={key}><code>{key}</code></li>
            ))}
          </ul>
          <p className="mt-2">Also set <code>INTUIT_ENVIRONMENT</code> to <code>sandbox</code> or <code>production</code>. The redirect URI must be the Intuit app redirect, ending in <code>/api/integrations/quickbooks/callback</code>. <code>INTUIT_TOKEN_ENCRYPTION_KEY</code> is 32 bytes, base64-encoded. Tokens stay on the server and are encrypted with that key.</p>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        {props.credentialsReady && !connected ? (
          <Button asChild>
            <a href="/api/integrations/quickbooks/connect">Connect QuickBooks</a>
          </Button>
        ) : null}
        {!props.credentialsReady ? (
          <Button type="button" disabled>
            Connect QuickBooks
          </Button>
        ) : null}
        {connected ? (
          <Button type="button" variant="outline" disabled={busy !== null} onClick={disconnect}>
            {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
          </Button>
        ) : null}
      </div>

      <div>
        <h2 className="text-lg font-semibold text-slate-900">Pull from QuickBooks</h2>
        <p className="mt-1 text-sm text-slate-600">Read-only. EmeraldOne keeps the QuickBooks id so a later pull updates the same customer, vendor, product, or expense instead of copying it. Writing back to QuickBooks is not enabled.</p>
        {connected ? (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {PULL_ENTITIES.map((entity) => (
              <Button key={entity} type="button" variant="outline" disabled={busy !== null} onClick={() => sync(entity)}>
                {busy === entity ? "Pulling…" : `Pull ${entity === "Item" ? "products" : entity === "Purchase" ? "expenses" : `${entity.toLowerCase()}s`}`}
              </Button>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">Pull stays off until a company is connected.</p>
        )}
        <ul className="mt-3 text-sm text-slate-600">
          {DEFERRED_ENTITIES.map((entity) => (
            <li key={entity}>{entity}: the connection can represent this type later. There is no pull button because creating invoices, payments, or accounts from QuickBooks is not enabled.</li>
          ))}
        </ul>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-slate-900">Sync log</h2>
        {props.logs.length === 0 ? <p className="mt-2 text-sm text-slate-500">No sync attempts yet.</p> : (
          <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {props.logs.map((log) => (
              <li key={log.id} className="px-4 py-3 text-sm">
                <p className="font-medium text-slate-900">{log.direction} {log.entityType} · {log.status}</p>
                <p className="text-slate-600">Imported {log.importedCount} · updated {log.updatedCount} · skipped {log.skippedCount} · failed {log.failedCount}</p>
                {log.message ? <p className="text-slate-500">{log.message}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
