import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Subscription } from "@prisma/client";
import type Stripe from "stripe";
import {
  handleInvoicePaymentActionRequired,
  handleInvoicePaymentFailed,
  handleInvoicePaymentSucceeded,
  handleSubscriptionDeleted,
  markWebhookEventProcessed,
  mapStripeSubscriptionStatus,
  syncSubscriptionFromStripe,
  type SubscriptionDbClient,
} from "./stripe-subscription-sync";

function makeSubscription(
  overrides: Partial<Subscription> & Pick<Subscription, "status">
): Subscription {
  return {
    id: "sub_1",
    businessId: "biz_1",
    plan: "STARTER",
    stripeCustomerId: "cus_test",
    stripeSubscriptionId: "sub_stripe_1",
    stripePriceId: "price_test",
    currentPeriodEnd: null,
    trialEndsAt: null,
    pastDueSince: null,
    paymentActionRequiredAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Subscription;
}

type MockDb = SubscriptionDbClient & {
  webhookEvents: Map<string, { id: string; type: string }>;
  subscriptions: Map<string, Subscription>;
};

function createMockDb(): MockDb {
  const webhookEvents = new Map<string, { id: string; type: string }>();
  const subscriptions = new Map<string, Subscription>();

  const client = {
    webhookEvents,
    subscriptions,
    stripeWebhookEvent: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        webhookEvents.get(where.id) ?? null,
      create: async ({ data }: { data: { id: string; type: string } }) => {
        webhookEvents.set(data.id, data);
        return data;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        webhookEvents.delete(where.id);
      },
    },
    subscription: {
      findUnique: async ({ where }: { where: { businessId?: string } }) => {
        if (!where.businessId) return null;
        return (
          Array.from(subscriptions.values()).find(
            (s) => s.businessId === where.businessId
          ) ?? null
        );
      },
      findFirst: async ({ where }: { where: { stripeCustomerId?: string } }) => {
        if (!where.stripeCustomerId) return null;
        return (
          Array.from(subscriptions.values()).find(
            (s) => s.stripeCustomerId === where.stripeCustomerId
          ) ?? null
        );
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { businessId: string };
        create: Partial<Subscription>;
        update: Partial<Subscription>;
      }) => {
        const existing = Array.from(subscriptions.values()).find(
          (s) => s.businessId === where.businessId
        );
        if (existing) {
          const updated = { ...existing, ...update };
          subscriptions.set(existing.id, updated as Subscription);
          return updated;
        }
        const created = { ...create, id: "sub_new" } as Subscription;
        subscriptions.set(created.id, created);
        return created;
      },
      update: async ({
        where,
        data,
      }: {
        where: { businessId?: string; id?: string };
        data: Partial<Subscription>;
      }) => {
        const existing = Array.from(subscriptions.values()).find((s) => {
          if (where.businessId) return s.businessId === where.businessId;
          if (where.id) return s.id === where.id;
          return false;
        });
        if (!existing) throw new Error("not found");
        const updated = { ...existing, ...data };
        subscriptions.set(existing.id, updated as Subscription);
        return updated;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: {
          stripeCustomerId?: string;
          status?: { in: string[] };
        };
        data: Partial<Subscription>;
      }) => {
        let count = 0;
        for (const [id, sub] of subscriptions) {
          const matchesCustomer =
            where.stripeCustomerId &&
            sub.stripeCustomerId === where.stripeCustomerId;
          const matchesStatus =
            where.status?.in && where.status.in.includes(sub.status);
          if (matchesCustomer && (!where.status || matchesStatus)) {
            subscriptions.set(id, { ...sub, ...data } as Subscription);
            count++;
          }
        }
        return { count };
      },
    },
  };

  return client as unknown as MockDb;
}

describe("mapStripeSubscriptionStatus", () => {
  it("maps unpaid status", () => {
    assert.equal(mapStripeSubscriptionStatus("unpaid"), "UNPAID");
  });
});

describe("markWebhookEventProcessed", () => {
  it("processes new events once", async () => {
    const db = createMockDb();
    const first = await markWebhookEventProcessed("evt_1", "test.event", db);
    const second = await markWebhookEventProcessed("evt_1", "test.event", db);
    assert.equal(first, true);
    assert.equal(second, false);
    assert.equal(db.webhookEvents.size, 1);
  });
});

describe("syncSubscriptionFromStripe", () => {
  it("creates subscription from stripe object", async () => {
    const db = createMockDb();
    const stripeSub = {
      id: "sub_stripe_1",
      status: "active",
      metadata: { businessId: "biz_1", plan: "PRO" },
      customer: "cus_test",
      items: { data: [{ price: { id: "price_pro" }, current_period_end: 1_900_000_000 }] },
      trial_end: null,
    } as unknown as Stripe.Subscription;

    await syncSubscriptionFromStripe(stripeSub, db);
    const stored = await db.subscription.findUnique({ where: { businessId: "biz_1" } });
    assert.ok(stored);
    assert.equal(stored?.status, "ACTIVE");
    assert.equal(stored?.plan, "PRO");
  });

  it("updates existing subscription on status change", async () => {
    const db = createMockDb();
    db.subscriptions.set("sub_1", makeSubscription({ status: "ACTIVE" }));

    const stripeSub = {
      id: "sub_stripe_1",
      status: "past_due",
      metadata: { businessId: "biz_1", plan: "STARTER" },
      customer: "cus_test",
      items: { data: [{ price: { id: "price_test" } }] },
    } as unknown as Stripe.Subscription;

    await syncSubscriptionFromStripe(stripeSub, db);
    const stored = await db.subscription.findUnique({ where: { businessId: "biz_1" } });
    assert.equal(stored?.status, "PAST_DUE");
    assert.ok(stored?.pastDueSince);
  });
});

describe("handleSubscriptionDeleted", () => {
  it("marks subscription canceled", async () => {
    const db = createMockDb();
    db.subscriptions.set("sub_1", makeSubscription({ status: "ACTIVE" }));

    await handleSubscriptionDeleted(
      { metadata: { businessId: "biz_1" } } as unknown as Stripe.Subscription,
      db
    );

    const stored = await db.subscription.findUnique({ where: { businessId: "biz_1" } });
    assert.equal(stored?.status, "CANCELED");
    assert.equal(stored?.stripeSubscriptionId, null);
  });
});

describe("handleInvoicePaymentSucceeded", () => {
  it("reactivates past due subscriptions", async () => {
    const db = createMockDb();
    db.subscriptions.set(
      "sub_1",
      makeSubscription({
        status: "PAST_DUE",
        pastDueSince: new Date(),
        paymentActionRequiredAt: new Date(),
      })
    );

    await handleInvoicePaymentSucceeded(
      { customer: "cus_test" } as Stripe.Invoice,
      db
    );

    const stored = await db.subscription.findUnique({ where: { businessId: "biz_1" } });
    assert.equal(stored?.status, "ACTIVE");
    assert.equal(stored?.pastDueSince, null);
    assert.equal(stored?.paymentActionRequiredAt, null);
  });
});

describe("handleInvoicePaymentFailed", () => {
  it("sets past due with timestamp", async () => {
    const db = createMockDb();
    db.subscriptions.set("sub_1", makeSubscription({ status: "ACTIVE" }));

    await handleInvoicePaymentFailed(
      { customer: "cus_test" } as Stripe.Invoice,
      db
    );

    const stored = await db.subscription.findUnique({ where: { businessId: "biz_1" } });
    assert.equal(stored?.status, "PAST_DUE");
    assert.ok(stored?.pastDueSince);
  });
});

describe("handleInvoicePaymentActionRequired", () => {
  it("sets paymentActionRequiredAt", async () => {
    const db = createMockDb();
    db.subscriptions.set("sub_1", makeSubscription({ status: "ACTIVE" }));

    await handleInvoicePaymentActionRequired(
      { customer: "cus_test" } as Stripe.Invoice,
      db
    );

    const stored = await db.subscription.findUnique({ where: { businessId: "biz_1" } });
    assert.ok(stored?.paymentActionRequiredAt);
  });
});
