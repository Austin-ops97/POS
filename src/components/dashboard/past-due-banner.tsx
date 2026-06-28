"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { BILLING_URL } from "@/lib/subscription-access";

type PastDueBannerProps = {
  daysRemaining: number;
};

export function PastDueBanner({ daysRemaining }: PastDueBannerProps) {
  return (
    <div className="border-b border-red-200 bg-red-50 px-6 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-red-900">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            Your payment is past due. You have{" "}
            <strong>
              {daysRemaining} day{daysRemaining === 1 ? "" : "s"}
            </strong>{" "}
            remaining before access is restricted.
          </span>
        </div>
        <Link
          href={BILLING_URL}
          className="text-sm font-medium text-red-900 underline hover:text-red-950"
        >
          Update payment method
        </Link>
      </div>
    </div>
  );
}
