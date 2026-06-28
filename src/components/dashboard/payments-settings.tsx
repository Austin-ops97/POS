"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CreditCard, Wifi, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";
import {
  getReaderStatusVariant,
  getStripeStatusVariant,
} from "@/lib/status-utils";
import type { ReaderStatus, StripeAccountStatus } from "@prisma/client";

type StripeConnectStatus = {
  status: StripeAccountStatus;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  connected?: boolean;
};

type TerminalReader = {
  id: string;
  name: string;
  status: string;
  serialNumber?: string | null;
  location?: { name: string } | null;
};

export function PaymentsSettings() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [stripeAccount, setStripeAccount] = useState<StripeConnectStatus | null>(null);
  const [readers, setReaders] = useState<TerminalReader[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [connectRes, terminalRes] = await Promise.all([
        fetch("/api/stripe/connect"),
        fetch("/api/stripe/terminal"),
      ]);

      if (connectRes.ok) {
        const data = (await connectRes.json()) as StripeConnectStatus;
        setStripeAccount(data);
      } else {
        const err = (await connectRes.json().catch(() => null)) as {
          error?: string;
        } | null;
        toast.error(err?.error ?? "Failed to load Stripe status");
      }

      if (terminalRes.ok) {
        const data = (await terminalRes.json()) as { readers: TerminalReader[] };
        setReaders(data.readers ?? []);
      } else {
        const err = (await terminalRes.json().catch(() => null)) as {
          error?: string;
        } | null;
        toast.error(err?.error ?? "Failed to load terminal readers");
      }
    } catch {
      toast.error("Failed to load payment settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleConnectStripe() {
    setConnecting(true);
    try {
      const baseUrl = window.location.origin;
      const res = await fetch("/api/stripe/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          returnUrl: `${baseUrl}/settings/payments`,
          refreshUrl: `${baseUrl}/settings/payments`,
        }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(err?.error ?? "Failed to start Stripe onboarding");
      }

      const data = (await res.json()) as { url?: string };
      if (data.url) {
        window.location.href = data.url;
        return;
      }

      toast.success("Stripe account updated");
      await loadData();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Stripe connection failed");
    } finally {
      setConnecting(false);
    }
  }

  const status = stripeAccount?.status ?? "NOT_CONNECTED";
  const isFullyConnected = status === "CONNECTED" || status === "READY";
  const showConnectButton = !isFullyConnected;

  function statusDescription() {
    if (status === "NOT_CONNECTED") {
      return "Stripe Connect has not been set up yet.";
    }
    if (status === "PENDING" || !stripeAccount?.detailsSubmitted) {
      return "Stripe onboarding is incomplete. Continue setup to accept card payments.";
    }
    if (status === "RESTRICTED") {
      return "Your Stripe account has restrictions. Complete required actions in Stripe.";
    }
    if (stripeAccount?.chargesEnabled) {
      return "Stripe is connected and ready to accept card payments.";
    }
    return "Stripe account is connected. Charges are not yet enabled.";
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Stripe Connect</CardTitle>
              <CardDescription>
                Accept card payments through Stripe
              </CardDescription>
            </div>
            {stripeAccount && !loading && (
              <Badge
                variant={getStripeStatusVariant(
                  stripeAccount.status as Parameters<typeof getStripeStatusVariant>[0]
                )}
              >
                {stripeAccount.status.replace(/_/g, " ")}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-slate-500">Loading Stripe status...</p>
          ) : stripeAccount ? (
            <>
              <p className="text-sm text-slate-500">{statusDescription()}</p>
              <div className="grid gap-3 text-sm sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-slate-500">Charges</p>
                  <p className="font-medium text-slate-900">
                    {stripeAccount.chargesEnabled ? "Enabled" : "Disabled"}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-slate-500">Payouts</p>
                  <p className="font-medium text-slate-900">
                    {stripeAccount.payoutsEnabled ? "Enabled" : "Disabled"}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-slate-500">Details</p>
                  <p className="font-medium text-slate-900">
                    {stripeAccount.detailsSubmitted ? "Submitted" : "Incomplete"}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">
              Stripe Connect has not been set up yet.
            </p>
          )}
          {showConnectButton && (
            <Button disabled={connecting || loading} onClick={handleConnectStripe}>
              <CreditCard className="h-4 w-4" />
              {connecting
                ? "Connecting..."
                : status === "PENDING"
                  ? "Continue Stripe Setup"
                  : "Connect with Stripe"}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Terminal Readers</CardTitle>
          <CardDescription>
            Stripe Terminal devices for in-person card payments
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-500">Loading readers...</p>
          ) : readers.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title="No readers configured"
              description="Connect a Stripe Terminal reader to accept in-person card payments."
            />
          ) : (
            <div className="space-y-3">
              {readers.map((reader) => (
                <div
                  key={reader.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 p-4"
                >
                  <div className="flex items-center gap-3">
                    {reader.status === "ONLINE" ? (
                      <Wifi className="h-5 w-5 text-emerald-600" />
                    ) : (
                      <WifiOff className="h-5 w-5 text-slate-400" />
                    )}
                    <div>
                      <p className="font-medium text-slate-900">{reader.name}</p>
                      <p className="text-xs text-slate-500">
                        {reader.location?.name ?? "No location"}
                        {reader.serialNumber && ` · ${reader.serialNumber}`}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant={getReaderStatusVariant(
                      reader.status as ReaderStatus
                    )}
                  >
                    {reader.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
