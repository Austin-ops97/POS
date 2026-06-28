"use client";

import Link from "next/link";
import { CreditCard, Lock, Mail, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SubscriptionAccessStatus } from "@/lib/subscription-access";

type SubscriptionLockoutProps = {
  access: SubscriptionAccessStatus;
};

export function SubscriptionLockout({ access }: SubscriptionLockoutProps) {
  const isTrialEnded = access.isTrialExpired;
  const isPastDue = access.status === "PAST_DUE" && !access.canAccessPaidApp;
  const isCanceled = access.status === "CANCELED";

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
            <Lock className="h-7 w-7 text-amber-700" />
          </div>
          <CardTitle className="text-xl">
            {isTrialEnded
              ? "Your trial has ended"
              : isPastDue
                ? "Payment required"
                : isCanceled
                  ? "Subscription canceled"
                  : "Subscription required"}
          </CardTitle>
          <CardDescription className="text-base">{access.reason}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-center gap-2">
            <span className="text-sm text-slate-500">Status</span>
            <Badge variant="warning">{access.status.replace(/_/g, " ")}</Badge>
          </div>

          {access.gracePeriodEndsAt && access.canAccessPaidApp === false && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Your grace period ended. Update your payment method to restore full access.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href={access.billingUrl} className="flex-1">
              <Button className="w-full gap-2">
                <CreditCard className="h-4 w-4" />
                {isTrialEnded ? "Choose a plan" : "Manage billing"}
              </Button>
            </Link>
            <Link href="/contact" className="flex-1">
              <Button variant="outline" className="w-full gap-2">
                <Mail className="h-4 w-4" />
                Contact support
              </Button>
            </Link>
          </div>

          <p className="text-center text-xs text-slate-500">
            You can still access billing, account settings, and Stripe Connect from the
            sidebar.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
