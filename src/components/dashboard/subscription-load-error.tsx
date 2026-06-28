"use client";

import Link from "next/link";
import { AlertCircle, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BILLING_URL } from "@/lib/subscription-access";

export function SubscriptionLoadError() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
            <AlertCircle className="h-7 w-7 text-slate-600" />
          </div>
          <CardTitle className="text-xl">Subscription status unavailable</CardTitle>
          <CardDescription className="text-base">
            We could not verify your subscription status right now. This is usually
            temporary.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-center text-sm text-slate-600">
            Billing, account settings, and Stripe Connect remain available from the
            sidebar. Please try again shortly or contact support if this persists.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href={BILLING_URL} className="flex-1">
              <Button className="w-full">Go to billing</Button>
            </Link>
            <Link href="/contact" className="flex-1">
              <Button variant="outline" className="w-full gap-2">
                <Mail className="h-4 w-4" />
                Contact support
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
