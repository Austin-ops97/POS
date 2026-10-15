import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ReceiptData } from "./receipt-data";
import {
  formatPaymentMethodLabel,
} from "./receipt-data";
import { renderReceiptHtml, renderReceiptPlainText } from "./receipt-html";
import { buildReceiptEmailMessage, isReceiptEmailConfigured } from "./receipt-email";
import { generateReceiptPdf } from "./receipt-pdf";
import { filenameFromContentDisposition, receiptPdfFilename } from "./receipt-filename";

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
    displayTimezone: "America/New_York",
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

describe("receipt PDF filename", () => {
  it("uses the customer-facing order number", () => {
    assert.equal(receiptPdfFilename("ORD-1001"), "Receipt-ORD-1001.pdf");
    assert.equal(receiptPdfFilename('ORD/1"\r\n'), "Receipt-ORD1.pdf");
  });

  it("reads the server filename from Content-Disposition", () => {
    const header = `attachment; filename="Receipt-ORD-1001.pdf"; filename*=UTF-8''Receipt-ORD-1001.pdf`;
    assert.equal(filenameFromContentDisposition(header, "Receipt.pdf"), "Receipt-ORD-1001.pdf");
    assert.equal(filenameFromContentDisposition(null, "Receipt.pdf"), "Receipt.pdf");
  });
});

function pdfText(buffer: Buffer): string {
  const parts: string[] = [];
  for (const match of buffer.toString("latin1").matchAll(/<([0-9A-Fa-f]+)>/g)) {
    const hex = match[1];
    if (!hex || hex.length % 2 !== 0) continue;
    parts.push(Buffer.from(hex, "hex").toString("latin1"));
  }
  return parts.join("");
}

describe("receipt PDF and email attachment", () => {
  it("includes the same line items, tax, discount, and total as the preview", async () => {
    const data = makeReceiptData({
      subtotal: 9,
      discountAmount: 1,
      taxAmount: 0.74,
      total: 8.74,
      lineItems: [
        {
          name: "Coffee",
          quantity: 2,
          unitPrice: 4.5,
          discountAmount: 1,
          taxAmount: 0.74,
          total: 8,
        },
      ],
    });
    const html = renderReceiptHtml(data);
    const pdf = await generateReceiptPdf(data);
    const text = pdfText(pdf);
    for (const value of ["ORD-1001", "Coffee", "$4.50", "$8.00", "$9.00", "-$1.00", "$0.74", "$8.74"]) {
      assert.match(html, new RegExp(value.replace(/[$.]/g, "\\$&")));
      assert.match(text, new RegExp(value.replace(/[$.]/g, "\\$&")));
    }
    assert.match(html, /<td class="qty">2<\/td>/);
    assert.match(text, /2x Coffee/);
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  });

  it("attaches a receipt PDF named with the order number", async () => {
    const message = await buildReceiptEmailMessage(makeReceiptData());
    assert.equal(message.attachments.length, 1);
    assert.equal(message.attachments[0]?.filename, "Receipt-ORD-1001.pdf");
    assert.equal(message.attachments[0]?.contentType, "application/pdf");
    assert.equal(message.attachments[0]?.content.subarray(0, 5).toString(), "%PDF-");
    assert.match(message.html, /Coffee/);
    assert.match(message.html, /\$9\.74/);
    assert.match(message.text, /ORD-1001/);
    assert.match(message.subject, /ORD-1001/);
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
