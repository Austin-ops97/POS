"use client";

import { usePathname } from "next/navigation";
import type { SubscriptionAccessStatus } from "@/lib/subscription-access";
import { isBillingExemptPath } from "@/lib/subscription-access";
import { SubscriptionLockout } from "./subscription-lockout";
import { TrialBanner } from "./trial-banner";

type SubscriptionGateProps = {
  access: SubscriptionAccessStatus;
  children: React.ReactNode;
};

export function SubscriptionGate({ access, children }: SubscriptionGateProps) {
  const pathname = usePathname() ?? "";

  if (access.canAccessPaidApp) {
    return (
      <>
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
