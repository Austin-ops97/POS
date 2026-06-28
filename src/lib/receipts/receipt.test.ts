import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ReceiptData } from "./receipt-data";
import {
  formatPaymentMethodLabel,
} from "./receipt-data";
import { renderReceiptHtml, renderReceiptPlainText } from "./receipt-html";
import { isReceiptEmailConfigured } from "./receipt-email";

function makeReceiptData(overrides: Partial<ReceiptData> = {}): ReceiptData {
  return {
    receiptId: "rcp_1",
    receiptNumber: "RCP-1001",
    orderId: "ord_1",
    orderNumber: "ORD-1001",
    orderStatus: "PAID",
    createdAt: "2026-06-01T12:00:00.000Z",
    paidAt: "2026-06-01T12:00:00.000Z",
    business: {
      name: "Test Shop",
      phone: "555-0100",
      email: "shop@example.com",
    },
    location: {
      name: "Main Store",
      addressLines: ["123 Main St", "Austin, TX 78701"],
    },
    settings: {
      footer: "Thanks!",
      showCashier: true,
      showCustomer: true,
      showSku: false,
      showBusinessEmail: true,
      showBusinessPhone: true,
    },
    employee: { name: "Alex" },
    lineItems: [
      {
        name: "Coffee",
        quantity: 2,
        unitPrice: 4.5,
        discountAmount: 0,
        taxAmount: 0.74,
        total: 9,
      },
    ],
    discounts: [],
    subtotal: 9,
    discountAmount: 0,
    taxAmount: 0.74,
    total: 9.74,
    payments: [
      {
        method: "CARD",
        amount: 9.74,
        status: "SUCCEEDED",
        cardBrand: "visa",
        cardLast4: "4242",
        stripePaymentIntentId: "pi_test_123",
        createdAt: "2026-06-01T12:00:00.000Z",
      },
    ],
    refunds: [],
    totalRefunded: 0,
    netPaid: 9.74,
    isRefunded: false,
    isPartiallyRefunded: false,
    printed: false,
    ...overrides,
  };
}

describe("formatPaymentMethodLabel", () => {
  it("formats card payments with brand and last4", () => {
    const label = formatPaymentMethodLabel({
      method: "CARD",
      amount: 10,
      status: "SUCCEEDED",
      cardBrand: "visa",
      cardLast4: "4242",
      createdAt: "2026-06-01T12:00:00.000Z",
    });
    assert.match(label, /4242/);
    assert.match(label, /Visa/i);
  });
});

describe("renderReceiptHtml", () => {
  it("includes order totals and line items", () => {
    const html = renderReceiptHtml(makeReceiptData());
    assert.match(html, /ORD-1001/);
    assert.match(html, /Coffee/);
    assert.match(html, /\$9\.74/);
    assert.match(html, /Test Shop/);
  });

  it("includes cash tender and change", () => {
    const html = renderReceiptHtml(
      makeReceiptData({
        payments: [
          {
            method: "CASH",
            amount: 9.74,
            status: "SUCCEEDED",
            amountTendered: 20,
            changeDue: 10.26,
            createdAt: "2026-06-01T12:00:00.000Z",
          },
        ],
      })
    );
    assert.match(html, /Tendered/);
    assert.match(html, /Change/);
  });

  it("includes refund details", () => {
    const html = renderReceiptHtml(
      makeReceiptData({
        orderStatus: "PARTIALLY_REFUNDED",
        isPartiallyRefunded: true,
        totalRefunded: 5,
        netPaid: 4.74,
        refunds: [
          {
            amount: 5,
            taxAmount: 0,
            reason: "CUSTOMER_RETURN",
            createdAt: "2026-06-02T12:00:00.000Z",
          },
        ],
      })
    );
    assert.match(html, /Refunds/);
    assert.match(html, /Net paid/);
  });
});

describe("renderReceiptPlainText", () => {
  it("renders plain text receipt", () => {
    const text = renderReceiptPlainText(makeReceiptData());
    assert.match(text, /ORD-1001/);
    assert.match(text, /Total:/);
  });
});

describe("isReceiptEmailConfigured", () => {
  it("returns false when env vars missing", () => {
    const originalKey = process.env.RESEND_API_KEY;
    const originalFrom = process.env.RECEIPTS_FROM_EMAIL;
    delete process.env.RESEND_API_KEY;
    delete process.env.RECEIPTS_FROM_EMAIL;
    assert.equal(isReceiptEmailConfigured(), false);
    process.env.RESEND_API_KEY = originalKey;
    process.env.RECEIPTS_FROM_EMAIL = originalFrom;
  });
});
