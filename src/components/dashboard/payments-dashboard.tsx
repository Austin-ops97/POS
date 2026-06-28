"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  CreditCard,
  ExternalLink,
  RefreshCw,
  Wallet,
  Clock,
  AlertTriangle,
  RotateCcw,
  Shield,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getStripeStatusVariant } from "@/lib/status-utils";
import type { StripeAccountStatus } from "@prisma/client";

type DashboardData = {
  connected: boolean;
  status: StripeAccountStatus;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  balance: { available: number; pending: number; currency: string } | null;
  payouts: Array<{
    id: string;
    amount: number;
    status: string;
    arrivalDate: string | null;
    createdAt: string;
    method: string;
  }>;
  refunds: Array<{
    id: string;
    amount: number;
    status: string;
    reason: string | null;
    createdAt: string;
  }>;
  disputes: Array<{
    id: string;
    amount: number;
    status: string;
    reason: string;
    createdAt: string;
  }>;
  fees: { total: number; count: number };
  instantPayoutEligible: boolean;
  upcomingPayout: {
    id: string;
    amount: number;
    status: string;
    arrivalDate: string | null;
  } | null;
  requirements?: { currently_due?: string[]; disabled_reason?: string | null };
};

export function PaymentsDashboard() {
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/dashboard");
      if (res.ok) {
        setData(await res.json());
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Failed to load payment data");
      }
    } catch {
      toast.error("Failed to load payment data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleConnect() {
    setConnecting(true);
    try {
      const baseUrl = window.location.origin;
      const res = await fetch("/api/stripe/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          returnUrl: `${baseUrl}/payments`,
          refreshUrl: `${baseUrl}/payments`,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to connect");
      }
      const result = await res.json();
      if (result.url) window.location.href = result.url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setConnecting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!data?.connected) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center py-16 text-center">
          <CreditCard className="mb-4 h-12 w-12 text-slate-300" />
          <h3 className="text-lg font-semibold text-slate-900">
            Connect Stripe to accept payments
          </h3>
          <p className="mt-2 max-w-md text-sm text-slate-500">
            Link your Stripe account to view balances, payouts, and payment health — all
            inside NexaPOS.
          </p>
          <Button className="mt-6" onClick={handleConnect} disabled={connecting}>
            {connecting ? "Connecting…" : "Connect Stripe"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Badge variant={getStripeStatusVariant(data.status)}>
            {data.status.replace(/_/g, " ")}
          </Badge>
          {data.chargesEnabled && (
            <span className="text-sm text-emerald-600">Charges enabled</span>
          )}
          {data.payoutsEnabled && (
            <span className="text-sm text-emerald-600">Payouts enabled</span>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void loadData()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Link href="/settings/payments">
            <Button variant="outline" size="sm">
              Terminal & settings
            </Button>
          </Link>
          <Button variant="ghost" size="sm" asChild>
            <a
              href="https://dashboard.stripe.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Stripe Dashboard
            </a>
          </Button>
        </div>
      </div>

      {data.requirements?.currently_due && data.requirements.currently_due.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex items-start gap-3 py-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
            <div>
              <p className="font-medium text-amber-900">Action required on your Stripe account</p>
              <p className="mt-1 text-sm text-amber-800">
                Complete outstanding requirements to keep accepting payments.
              </p>
              <Button className="mt-3" size="sm" onClick={handleConnect} disabled={connecting}>
                Complete setup
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <Wallet className="h-4 w-4" />
              Available Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-slate-900">
              {formatCurrency(data.balance?.available ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <Clock className="h-4 w-4" />
              Pending Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-slate-900">
              {formatCurrency(data.balance?.pending ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-500">
              Processing Fees
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-slate-900">
              {formatCurrency(data.fees.total)}
            </p>
            <p className="text-xs text-slate-500">{data.fees.count} recent transactions</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <Zap className="h-4 w-4" />
              Instant Payout
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={data.instantPayoutEligible ? "success" : "secondary"}>
              {data.instantPayoutEligible ? "Eligible" : "Not available"}
            </Badge>
            {data.upcomingPayout && (
              <p className="mt-2 text-xs text-slate-500">
                Next: {formatCurrency(data.upcomingPayout.amount)}
                {data.upcomingPayout.arrivalDate &&
                  ` · ${formatDate(data.upcomingPayout.arrivalDate)}`}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Payouts</CardTitle>
            <CardDescription>Transfers to your bank account</CardDescription>
          </CardHeader>
          <CardContent>
            {data.payouts.length === 0 ? (
              <p className="text-sm text-slate-500">No payouts yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.payouts.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-3 text-sm">
                    <div>
                      <p className="font-medium text-slate-900">{formatCurrency(p.amount)}</p>
                      <p className="text-xs text-slate-500">{formatDate(p.createdAt)}</p>
                    </div>
                    <Badge variant="secondary">{p.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-slate-400" />
              Recent Refunds
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.refunds.length === 0 ? (
              <p className="text-sm text-slate-500">No refunds in this period.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.refunds.map((r) => (
                  <li key={r.id} className="flex items-center justify-between py-3 text-sm">
                    <div>
                      <p className="font-medium text-slate-900">{formatCurrency(r.amount)}</p>
                      <p className="text-xs text-slate-500 capitalize">
                        {r.reason?.replace(/_/g, " ") ?? "Refund"}
                      </p>
                    </div>
                    <span className="text-xs text-slate-500">{formatDate(r.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-slate-400" />
            Disputes
          </CardTitle>
          <CardDescription>Chargebacks and disputes requiring attention</CardDescription>
        </CardHeader>
        <CardContent>
          {data.disputes.length === 0 ? (
            <p className="text-sm text-slate-500">No open disputes. Great job!</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.disputes.map((d) => (
                <li key={d.id} className="flex items-center justify-between py-3 text-sm">
                  <div>
                    <p className="font-medium text-slate-900">{formatCurrency(d.amount)}</p>
                    <p className="text-xs text-slate-500 capitalize">
                      {d.reason?.replace(/_/g, " ")}
                    </p>
                  </div>
                  <Badge variant="warning">{d.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connection Health</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="flex justify-between rounded-lg border border-slate-200 px-4 py-3">
              <dt className="text-sm text-slate-500">Charges</dt>
              <dd className="text-sm font-medium">{data.chargesEnabled ? "Active" : "Inactive"}</dd>
            </div>
            <div className="flex justify-between rounded-lg border border-slate-200 px-4 py-3">
              <dt className="text-sm text-slate-500">Payouts</dt>
              <dd className="text-sm font-medium">{data.payoutsEnabled ? "Active" : "Inactive"}</dd>
            </div>
            <div className="flex justify-between rounded-lg border border-slate-200 px-4 py-3">
              <dt className="text-sm text-slate-500">Details submitted</dt>
              <dd className="text-sm font-medium">{data.detailsSubmitted ? "Yes" : "No"}</dd>
            </div>
            <div className="flex justify-between rounded-lg border border-slate-200 px-4 py-3">
              <dt className="text-sm text-slate-500">Account status</dt>
              <dd className="text-sm font-medium">{data.status.replace(/_/g, " ")}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
