import Link from "next/link";
import { Clock } from "lucide-react";
import { BILLING_URL } from "@/lib/subscription-access";

type TrialBannerProps = {
  daysRemaining: number;
};

export function TrialBanner({ daysRemaining }: TrialBannerProps) {
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-6 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-amber-900">
          <Clock className="h-4 w-4 shrink-0" />
          <span>
            Your free trial ends in{" "}
            <strong>
              {daysRemaining} day{daysRemaining === 1 ? "" : "s"}
            </strong>
            . Subscribe now to keep uninterrupted access.
          </span>
        </div>
        <Link
          href={BILLING_URL}
          className="text-sm font-medium text-amber-900 underline hover:text-amber-950"
        >
          View plans
        </Link>
      </div>
    </div>
  );
}
