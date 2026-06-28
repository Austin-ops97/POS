import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderReceiptHtml } from "../receipts/receipt-html";
import type { ReceiptData } from "../receipts/receipt-data";

const sampleReceipt: ReceiptData = {
  receiptId: "rcp_preview",
  receiptNumber: "RCP-2001",
  orderId: "ord_preview",
  orderNumber: "ORD-2001",
  orderStatus: "PAID",
  createdAt: "2026-06-01T12:00:00.000Z",
  paidAt: "2026-06-01T12:00:00.000Z",
  business: { name: "Preview Shop" },
  location: { name: "Main", addressLines: [] },
  settings: {
    footer: "",
    showCashier: false,
    showCustomer: false,
    showSku: false,
    showBusinessEmail: false,
    showBusinessPhone: false,
  },
  lineItems: [
    {
      name: "Item",
      quantity: 1,
      unitPrice: 10,
      discountAmount: 0,
      taxAmount: 0,
      total: 10,
    },
  ],
  discounts: [],
  subtotal: 10,
  discountAmount: 0,
  taxAmount: 0,
  total: 10,
  payments: [
    {
      method: "CASH",
      amount: 10,
      status: "SUCCEEDED",
      amountTendered: 20,
      changeDue: 10,
      createdAt: "2026-06-01T12:00:00.000Z",
    },
  ],
  refunds: [],
  totalRefunded: 0,
  netPaid: 10,
  isRefunded: false,
  isPartiallyRefunded: false,
  printed: false,
};

describe("receipt preview rendering", () => {
  it("uses centralized receipt HTML service", () => {
    const html = renderReceiptHtml(sampleReceipt);
    assert.match(html, /ORD-2001/);
    assert.match(html, /RCP-2001/);
    assert.match(html, /@media print/);
  });
});
