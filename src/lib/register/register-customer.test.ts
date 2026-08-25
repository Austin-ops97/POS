import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { customerSchema } from "@/lib/validations";
import { useCartStore } from "../../stores/cart-store";
import { buildCheckoutPayload } from "./checkout-payload";
import {
  beginExclusiveSubmit,
  createCustomerPayload,
  customerDisplayName,
  endExclusiveSubmit,
  parseCreatedCustomer,
} from "./customer";

describe("register customer helpers", () => {
  it("validates required first name and optional email", () => {
    assert.equal(customerSchema.safeParse({ firstName: "  " }).success, false);
    assert.equal(customerSchema.safeParse({ firstName: "Alex" }).success, true);
    assert.equal(customerSchema.safeParse({ firstName: "Alex", email: "bad" }).success, false);
    assert.equal(customerSchema.safeParse({ firstName: "Alex", email: "alex@example.com" }).success, true);
  });

  it("builds a create payload from existing customer fields", () => {
    assert.deepEqual(
      createCustomerPayload({
        firstName: "  Alex ",
        lastName: " Kim ",
        email: " alex@example.com ",
        phone: "555-0100",
      }),
      {
        firstName: "Alex",
        lastName: "Kim",
        email: "alex@example.com",
        phone: "555-0100",
        address: undefined,
        notes: undefined,
        tags: undefined,
        marketingOptIn: undefined,
      }
    );
  });

  it("uses stable customer ids rather than names or indexes", () => {
    const created = parseCreatedCustomer({
      id: "cust_abc123",
      firstName: "Alex",
      lastName: "Kim",
      email: "alex@example.com",
    });
    assert.equal(created?.id, "cust_abc123");
    assert.equal(customerDisplayName(created!), "Alex Kim");
    assert.equal(parseCreatedCustomer({ firstName: "Alex" }), null);
  });

  it("prevents duplicate submissions with an exclusive lock", async () => {
    const lock = { current: false };
    assert.equal(beginExclusiveSubmit(lock), true);
    assert.equal(beginExclusiveSubmit(lock), false);
    endExclusiveSubmit(lock);
    assert.equal(beginExclusiveSubmit(lock), true);
  });
});

describe("register customer selection on the current sale", () => {
  it("selects and removes a customer by id", () => {
    const store = useCartStore.getState();
    store.startNewSale();
    store.setCustomer("cust_1", "Alex Kim");
    assert.equal(useCartStore.getState().customerId, "cust_1");
    assert.equal(useCartStore.getState().customerName, "Alex Kim");
    store.setCustomer(null, null);
    assert.equal(useCartStore.getState().customerId, null);
    assert.equal(useCartStore.getState().customerName, null);
  });

  it("persists the selected customer id through the checkout payload", () => {
    useCartStore.getState().startNewSale();
    useCartStore.getState().addItem({
      name: "Haircut",
      quantity: 1,
      unitPrice: 25,
      taxable: true,
    });
    useCartStore.getState().setCustomer("cust_stable_id", "Jordan Lee");
    const state = useCartStore.getState();
    const payload = buildCheckoutPayload({
      locationId: "loc_1",
      customerId: state.customerId,
      items: state.items,
      discounts: state.discounts,
      notes: state.notes,
    });
    assert.equal(payload.customerId, "cust_stable_id");
    assert.notEqual(payload.customerId, "Jordan Lee");
    assert.equal(payload.locationId, "loc_1");
  });
});
