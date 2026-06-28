"use client";

import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { BILLING_URL } from "@/lib/subscription-access";

export function PaymentActionBanner() {
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-6 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-amber-900">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>
            <strong>Payment action required.</strong> Your bank needs additional
            authentication to complete your subscription payment.
          </span>
        </div>
        <Link
          href={BILLING_URL}
          className="text-sm font-medium text-amber-900 underline hover:text-amber-950"
        >
          Complete payment
        </Link>
      </div>
    </div>
  );
}
