"use client";

import { usePathname } from "next/navigation";
import type { SubscriptionAccessStatus } from "@/lib/subscription-access";
import { isBillingExemptPath } from "@/lib/subscription-access";
import { PastDueBanner } from "./past-due-banner";
import { PaymentActionBanner } from "./payment-action-banner";
import { SubscriptionLoadError } from "./subscription-load-error";
import { SubscriptionLockout } from "./subscription-lockout";
import { TrialBanner } from "./trial-banner";

type SubscriptionGateProps = {
  access: SubscriptionAccessStatus;
  loadFailed?: boolean;
  children: React.ReactNode;
};

export function SubscriptionGate({
  access,
  loadFailed = false,
  children,
}: SubscriptionGateProps) {
  const pathname = usePathname() ?? "";

  if (loadFailed && access.isSubscriptionLoadFailed) {
    if (isBillingExemptPath(pathname)) {
      return <>{children}</>;
    }
    return <SubscriptionLoadError />;
  }

  if (access.canAccessPaidApp) {
    return (
      <>
        {access.isPaymentActionRequired && <PaymentActionBanner />}
        {access.isPastDueInGrace &&
          access.graceDaysRemaining !== null &&
          access.graceDaysRemaining > 0 && (
            <PastDueBanner daysRemaining={access.graceDaysRemaining} />
          )}
        {access.isTrialEndingSoon && access.trialDaysRemaining !== null && (
          <TrialBanner daysRemaining={access.trialDaysRemaining} />
        )}
        {children}
      </>
    );
  }

  if (isBillingExemptPath(pathname)) {
    return <>{children}</>;
  }

  return <SubscriptionLockout access={access} />;
}
