import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Subscription } from "@prisma/client";
import {
  canAccessPaidApp,
  canAddEmployee,
  canAddLocation,
  canAccessAdvancedReports,
  canUseTerminal,
  getSubscriptionAccessStatus,
  isBillingExemptPath,
  PAST_DUE_GRACE_DAYS,
} from "./subscription-access";
import { getBillingDisplayState } from "./billing-states";

function makeSubscription(
  overrides: Partial<Subscription> & Pick<Subscription, "status">
): Subscription {
  return {
    id: "sub_1",
    businessId: "biz_1",
    plan: "STARTER",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripePriceId: null,
    currentPeriodEnd: null,
    trialEndsAt: null,
    pastDueSince: null,
    paymentActionRequiredAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Subscription;
}

describe("getSubscriptionAccessStatus", () => {
  it("allows active trialing subscriptions before trial end", () => {
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 5);
    const access = getSubscriptionAccessStatus(
      makeSubscription({ status: "TRIALING", trialEndsAt })
    );
    assert.equal(access.canAccessPaidApp, true);
    assert.equal(access.level, "full");
  });

  it("blocks expired trials", () => {
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() - 1);
    const access = getSubscriptionAccessStatus(
      makeSubscription({ status: "TRIALING", trialEndsAt })
    );
    assert.equal(access.canAccessPaidApp, false);
    assert.equal(access.isTrialExpired, true);
  });

  it("allows active subscriptions", () => {
    const access = getSubscriptionAccessStatus(makeSubscription({ status: "ACTIVE" }));
    assert.equal(canAccessPaidApp(access), true);
  });

  it("allows past due within grace period with days remaining", () => {
    const pastDueSince = new Date();
    pastDueSince.setDate(pastDueSince.getDate() - 2);
    const access = getSubscriptionAccessStatus(
      makeSubscription({ status: "PAST_DUE", pastDueSince })
    );
    assert.equal(access.canAccessPaidApp, true);
    assert.equal(access.isPastDueInGrace, true);
    assert.ok(access.graceDaysRemaining && access.graceDaysRemaining > 0);
  });

  it("blocks past due after grace period", () => {
    const pastDueSince = new Date();
    pastDueSince.setDate(pastDueSince.getDate() - (PAST_DUE_GRACE_DAYS + 1));
    const access = getSubscriptionAccessStatus(
      makeSubscription({ status: "PAST_DUE", pastDueSince })
    );
    assert.equal(access.canAccessPaidApp, false);
    assert.equal(access.isPastDueInGrace, false);
  });

  it("blocks canceled subscriptions", () => {
    const access = getSubscriptionAccessStatus(makeSubscription({ status: "CANCELED" }));
    assert.equal(access.canAccessPaidApp, false);
  });

  it("blocks unpaid subscriptions", () => {
    const access = getSubscriptionAccessStatus(makeSubscription({ status: "UNPAID" }));
    assert.equal(access.canAccessPaidApp, false);
  });

  it("blocks incomplete subscriptions", () => {
    const access = getSubscriptionAccessStatus(makeSubscription({ status: "INCOMPLETE" }));
    assert.equal(access.canAccessPaidApp, false);
  });

  it("flags payment action required on active subscription", () => {
    const access = getSubscriptionAccessStatus(
      makeSubscription({
        status: "ACTIVE",
        paymentActionRequiredAt: new Date(),
      })
    );
    assert.equal(access.isPaymentActionRequired, true);
    assert.equal(access.canAccessPaidApp, true);
  });
});

describe("isBillingExemptPath", () => {
  it("allows billing and settings paths when blocked", () => {
    assert.equal(isBillingExemptPath("/settings/billing"), true);
    assert.equal(isBillingExemptPath("/settings/payments"), true);
    assert.equal(isBillingExemptPath("/settings"), true);
    assert.equal(isBillingExemptPath("/register"), false);
    assert.equal(isBillingExemptPath("/dashboard"), false);
  });
});

describe("plan entitlements", () => {
  it("enforces starter employee limit", () => {
    assert.equal(canAddEmployee("STARTER", 2), true);
    assert.equal(canAddEmployee("STARTER", 3), false);
  });

  it("enforces starter location limit", () => {
    assert.equal(canAddLocation("STARTER", 0), true);
    assert.equal(canAddLocation("STARTER", 1), false);
  });

  it("allows terminal on pro plan", () => {
    assert.equal(canUseTerminal("STARTER"), false);
    assert.equal(canUseTerminal("PRO"), true);
  });

  it("gates advanced reports by plan", () => {
    assert.equal(canAccessAdvancedReports("STARTER"), false);
    assert.equal(canAccessAdvancedReports("PRO"), true);
    assert.equal(canAccessAdvancedReports("MULTI_LOCATION"), true);
  });
});

describe("getBillingDisplayState", () => {
  it("returns past_due_grace during grace window", () => {
    const pastDueSince = new Date();
    pastDueSince.setDate(pastDueSince.getDate() - 1);
    const access = getSubscriptionAccessStatus(
      makeSubscription({ status: "PAST_DUE", pastDueSince })
    );
    assert.equal(getBillingDisplayState(access), "past_due_grace");
  });

  it("returns payment_action_required when flagged", () => {
    const access = getSubscriptionAccessStatus(
      makeSubscription({
        status: "ACTIVE",
        paymentActionRequiredAt: new Date(),
      })
    );
    assert.equal(getBillingDisplayState(access), "payment_action_required");
  });
});
