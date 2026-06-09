import Link from "next/link";
import { ArrowLeft, CreditCard, Wifi, WifiOff } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { getStripeSettings } from "@/lib/queries";
import { isDemoMode } from "@/lib/demo-mode";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";
import {
  getReaderStatusVariant,
  getStripeStatusVariant,
} from "@/lib/status-utils";

export default async function PaymentsSettingsPage() {
  const ctx = await requireAuth();
  const { stripeAccount } = await getStripeSettings(ctx);
  const readers: { id: string; name: string; status: string; serialNumber?: string | null; location?: { name: string } | null }[] = isDemoMode()
    ? [{ id: "reader-demo", name: "Simulated Reader", status: "ONLINE", serialNumber: "SIM-001", location: { name: "Main Store" } }]
    : [];

  const isConnected =
    stripeAccount?.status === "CONNECTED" || stripeAccount?.status === "READY";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/settings">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Payments</h1>
          <p className="text-sm text-slate-500">
            Stripe Connect and terminal reader configuration
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Stripe Connect</CardTitle>
              <CardDescription>
                Accept card payments through Stripe
              </CardDescription>
            </div>
            {stripeAccount && (
              <Badge variant={getStripeStatusVariant(stripeAccount.status as Parameters<typeof getStripeStatusVariant>[0])}>
                {stripeAccount.status.replace(/_/g, " ")}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {stripeAccount ? (
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
          ) : (
            <p className="text-sm text-slate-500">
              Stripe Connect has not been set up yet.
            </p>
          )}
          {!isConnected && (
            <Button>
              <CreditCard className="h-4 w-4" />
              Connect with Stripe
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
          {readers.length === 0 ? (
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
                  <Badge variant={getReaderStatusVariant(reader.status as Parameters<typeof getReaderStatusVariant>[0])}>
                    {reader.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
