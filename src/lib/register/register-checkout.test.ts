import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateChangeDue,
  getQuickCashAmounts,
  parseTenderAmount,
  validateCashTender,
} from "./cash-tender";
import { isValidReceiptEmail, normalizeReceiptEmail } from "./receipt-email";

// Cart store reset is validated via getState (no React render required).
import { useCartStore } from "../../stores/cart-store";

describe("cash tender", () => {
  it("parses valid decimal amounts", () => {
    assert.equal(parseTenderAmount("20"), 20);
    assert.equal(parseTenderAmount("20.50"), 20.5);
    assert.equal(parseTenderAmount("  10.99  "), 10.99);
  });

  it("rejects invalid decimal formats", () => {
    assert.equal(parseTenderAmount(""), null);
    assert.equal(parseTenderAmount("abc"), null);
    assert.equal(parseTenderAmount("-5"), null);
    assert.equal(parseTenderAmount("10.999"), null);
  });

  it("calculates change due", () => {
    assert.equal(calculateChangeDue(12.34, 20), 7.66);
    assert.equal(calculateChangeDue(10, 10), 0);
  });

  it("validates tendered amount against total", () => {
    assert.deepEqual(validateCashTender(15, 20), {
      valid: true,
      changeDue: 5,
    });
    assert.equal(validateCashTender(15, 10).valid, false);
    assert.equal(validateCashTender(15, -1).valid, false);
  });

  it("suggests useful quick cash amounts", () => {
    const amounts = getQuickCashAmounts(12.34);
    assert.ok(amounts.includes(12.34));
    assert.ok(amounts.includes(13));
    assert.ok(amounts.every((n) => n >= 12.34));
  });
});

describe("receipt email", () => {
  it("validates email addresses", () => {
    assert.equal(isValidReceiptEmail("customer@example.com"), true);
    assert.equal(isValidReceiptEmail("bad-email"), false);
    assert.equal(isValidReceiptEmail(""), false);
  });

  it("normalizes email", () => {
    assert.equal(normalizeReceiptEmail("  User@Example.COM "), "user@example.com");
  });
});

describe("register new sale reset", () => {
  it("clears cart, customer, discounts, and held order", () => {
    const store = useCartStore.getState();
    store.addItem({
      name: "Coffee",
      quantity: 1,
      unitPrice: 4,
      taxable: true,
    });
    store.addDiscount({
      id: "d1",
      name: "10% Off",
      type: "PERCENTAGE",
      value: 10,
    });
    store.setCustomer("cust_1", "Alex");
    store.setNotes("Note");
    store.loadHeldOrder("held_1", [
      {
        id: "item-1",
        name: "Held",
        quantity: 1,
        unitPrice: 1,
      },
    ]);

    store.startNewSale();
    const next = useCartStore.getState();
    assert.equal(next.items.length, 0);
    assert.equal(next.discounts.length, 0);
    assert.equal(next.customerId, null);
    assert.equal(next.customerName, null);
    assert.equal(next.notes, "");
    assert.equal(next.heldOrderId, null);
  });
});
