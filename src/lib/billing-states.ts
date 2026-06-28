import type { SubscriptionAccessStatus } from "./subscription-access";

export type BillingDisplayState =
  | "trialing"
  | "trial_ending_soon"
  | "trial_expired"
  | "active"
  | "past_due_grace"
  | "past_due_expired"
  | "payment_action_required"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "verification_failed";

export type BillingStateInfo = {
  state: BillingDisplayState;
  title: string;
  description: string;
  nextAction: string;
  actionLabel: string;
  variant: "success" | "warning" | "destructive" | "secondary";
};

export function getBillingDisplayState(
  access: SubscriptionAccessStatus
): BillingDisplayState {
  if (access.isSubscriptionLoadFailed) return "verification_failed";
  if (access.isPaymentActionRequired) return "payment_action_required";

  if (access.status === "TRIALING") {
    if (access.isTrialExpired) return "trial_expired";
    if (access.isTrialEndingSoon) return "trial_ending_soon";
    return "trialing";
  }

  if (access.status === "ACTIVE") return "active";

  if (access.status === "PAST_DUE") {
    return access.isPastDueInGrace ? "past_due_grace" : "past_due_expired";
  }

  if (access.status === "CANCELED") return "canceled";
  if (access.status === "UNPAID") return "unpaid";
  return "incomplete";
}

export function getBillingStateInfo(
  access: SubscriptionAccessStatus
): BillingStateInfo {
  const state = getBillingDisplayState(access);

  const states: Record<BillingDisplayState, BillingStateInfo> = {
    trialing: {
      state,
      title: "Free trial active",
      description: access.trialDaysRemaining
        ? `Your trial ends in ${access.trialDaysRemaining} day${access.trialDaysRemaining === 1 ? "" : "s"}.`
        : "Your free trial is active.",
      nextAction: "Choose a plan before your trial ends to avoid interruption.",
      actionLabel: "View plans",
      variant: "success",
    },
    trial_ending_soon: {
      state,
      title: "Trial ending soon",
      description: `Your trial ends in ${access.trialDaysRemaining ?? 0} day${access.trialDaysRemaining === 1 ? "" : "s"}.`,
      nextAction: "Subscribe now to keep uninterrupted access.",
      actionLabel: "Choose a plan",
      variant: "warning",
    },
    trial_expired: {
      state,
      title: "Trial ended",
      description: "Your free trial has ended.",
      nextAction: "Choose a plan to restore full access to NexaPOS.",
      actionLabel: "Choose a plan",
      variant: "destructive",
    },
    active: {
      state,
      title: "Subscription active",
      description: "Your NexaPOS subscription is active.",
      nextAction: "Manage billing, invoices, or change your plan anytime.",
      actionLabel: "Manage billing",
      variant: "success",
    },
    past_due_grace: {
      state,
      title: "Payment past due",
      description:
        access.graceDaysRemaining != null
          ? `Update your payment method within ${access.graceDaysRemaining} day${access.graceDaysRemaining === 1 ? "" : "s"} to avoid losing access.`
          : "Your payment is past due.",
      nextAction: "Update your payment method to keep your account active.",
      actionLabel: "Update payment method",
      variant: "warning",
    },
    past_due_expired: {
      state,
      title: "Grace period ended",
      description: "Your subscription is past due and access has been restricted.",
      nextAction: "Update your payment method to restore full access.",
      actionLabel: "Update payment method",
      variant: "destructive",
    },
    payment_action_required: {
      state,
      title: "Payment action required",
      description: "Your bank requires additional authentication to complete payment.",
      nextAction: "Complete the payment verification in the billing portal.",
      actionLabel: "Complete payment",
      variant: "warning",
    },
    canceled: {
      state,
      title: "Subscription canceled",
      description: "Your subscription is no longer active.",
      nextAction: "Choose a plan to restore access to NexaPOS.",
      actionLabel: "Choose a plan",
      variant: "destructive",
    },
    unpaid: {
      state,
      title: "Subscription unpaid",
      description: "We were unable to collect payment for your subscription.",
      nextAction: "Update your payment method to restore access.",
      actionLabel: "Update payment method",
      variant: "destructive",
    },
    incomplete: {
      state,
      title: "Setup incomplete",
      description: "Your subscription setup is not complete.",
      nextAction: "Finish checkout to activate your subscription.",
      actionLabel: "Complete setup",
      variant: "secondary",
    },
    verification_failed: {
      state,
      title: "Subscription status unavailable",
      description: "We could not verify your subscription status right now.",
      nextAction: "You can still manage billing and account settings. Try again shortly or contact support.",
      actionLabel: "Go to billing",
      variant: "warning",
    },
  };

  return { ...states[state], actionLabel: states[state].actionLabel };
}
