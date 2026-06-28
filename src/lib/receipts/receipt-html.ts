import type { ReceiptData } from "./receipt-data";
import {
  formatPaymentMethodLabel,
  formatReceiptMoney,
} from "./receipt-data";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatReceiptDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function renderReceiptPlainText(data: ReceiptData): string {
  const lines: string[] = [];
  lines.push(data.business.legalName || data.business.name);
  if (data.location.addressLines.length) {
    lines.push(...data.location.addressLines);
  }
  if (data.settings.showBusinessPhone && data.business.phone) {
    lines.push(data.business.phone);
  }
  if (data.settings.showBusinessEmail && data.business.email) {
    lines.push(data.business.email);
  }
  lines.push("");
  lines.push(`Order ${data.orderNumber}`);
  lines.push(`Receipt ${data.receiptNumber}`);
  lines.push(formatReceiptDate(data.paidAt ?? data.createdAt));
  lines.push(`Location: ${data.location.name}`);

  if (data.settings.showCashier && data.employee) {
    lines.push(`Cashier: ${data.employee.name}`);
  }
  if (data.settings.showCustomer && data.customer) {
    lines.push(`Customer: ${data.customer.name}`);
  }

  lines.push("");
  lines.push("--- Items ---");
  for (const item of data.lineItems) {
    const sku = data.settings.showSku && item.sku ? ` (${item.sku})` : "";
    lines.push(`${item.quantity}x ${item.name}${sku}`);
    lines.push(`  ${formatReceiptMoney(item.unitPrice)} ea  ${formatReceiptMoney(item.total)}`);
  }

  lines.push("");
  lines.push(`Subtotal: ${formatReceiptMoney(data.subtotal)}`);
  if (data.discountAmount > 0) {
    lines.push(`Discount: -${formatReceiptMoney(data.discountAmount)}`);
  }
  lines.push(`Tax: ${formatReceiptMoney(data.taxAmount)}`);
  lines.push(`Total: ${formatReceiptMoney(data.total)}`);

  if (data.payments.length) {
    lines.push("");
    lines.push("--- Payment ---");
    for (const payment of data.payments) {
      lines.push(`${formatPaymentMethodLabel(payment)}: ${formatReceiptMoney(payment.amount)}`);
      if (payment.method === "CASH" && payment.amountTendered != null) {
        lines.push(`  Tendered: ${formatReceiptMoney(payment.amountTendered)}`);
        if (payment.changeDue != null) {
          lines.push(`  Change: ${formatReceiptMoney(payment.changeDue)}`);
        }
      }
      if (payment.stripePaymentIntentId) {
        lines.push(`  Ref: ${payment.stripePaymentIntentId}`);
      }
    }
  }

  if (data.refunds.length) {
    lines.push("");
    lines.push("--- Refunds ---");
    for (const refund of data.refunds) {
      lines.push(
        `${formatReceiptDate(refund.createdAt)}: -${formatReceiptMoney(refund.amount)} (${refund.reason.replace(/_/g, " ")})`
      );
    }
    lines.push(`Total refunded: ${formatReceiptMoney(data.totalRefunded)}`);
    lines.push(`Net paid: ${formatReceiptMoney(data.netPaid)}`);
  }

  if (data.settings.footer) {
    lines.push("");
    lines.push(data.settings.footer);
  }
  if (data.settings.returnPolicy) {
    lines.push("");
    lines.push(data.settings.returnPolicy);
  }

  return lines.join("\n");
}

export function renderReceiptHtml(data: ReceiptData): string {
  const businessName = escapeHtml(data.business.legalName || data.business.name);
  const locationLines = data.location.addressLines.map(escapeHtml).join("<br />");
  const dateStr = escapeHtml(formatReceiptDate(data.paidAt ?? data.createdAt));

  const itemsHtml = data.lineItems
    .map((item) => {
      const sku =
        data.settings.showSku && item.sku
          ? `<div class="sku">${escapeHtml(item.sku)}</div>`
          : "";
      return `
        <tr>
          <td class="item-name">
            <div>${escapeHtml(item.name)}</div>
            ${sku}
          </td>
          <td class="qty">${item.quantity}</td>
          <td class="price">${escapeHtml(formatReceiptMoney(item.unitPrice))}</td>
          <td class="total">${escapeHtml(formatReceiptMoney(item.total))}</td>
        </tr>`;
    })
    .join("");

  const paymentsHtml = data.payments
    .map((payment) => {
      const extras: string[] = [];
      if (payment.method === "CASH" && payment.amountTendered != null) {
        extras.push(
          `Tendered: ${escapeHtml(formatReceiptMoney(payment.amountTendered))}`
        );
        if (payment.changeDue != null) {
          extras.push(`Change: ${escapeHtml(formatReceiptMoney(payment.changeDue))}`);
        }
      }
      if (payment.stripePaymentIntentId) {
        extras.push(`Ref: ${escapeHtml(payment.stripePaymentIntentId)}`);
      }
      return `
        <div class="payment-row">
          <span>${escapeHtml(formatPaymentMethodLabel(payment))}</span>
          <span>${escapeHtml(formatReceiptMoney(payment.amount))}</span>
        </div>
        ${extras.length ? `<div class="payment-extra">${extras.join(" · ")}</div>` : ""}`;
    })
    .join("");

  const refundsHtml =
    data.refunds.length > 0
      ? `
        <div class="section">
          <div class="section-title">Refunds</div>
          ${data.refunds
            .map(
              (refund) => `
            <div class="refund-row">
              <span>${escapeHtml(formatReceiptDate(refund.createdAt))}</span>
              <span>-${escapeHtml(formatReceiptMoney(refund.amount))}</span>
            </div>
            <div class="refund-reason">${escapeHtml(refund.reason.replace(/_/g, " "))}${refund.reasonNote ? ` — ${escapeHtml(refund.reasonNote)}` : ""}</div>`
            )
            .join("")}
          <div class="totals-row"><span>Total refunded</span><span>-${escapeHtml(formatReceiptMoney(data.totalRefunded))}</span></div>
          <div class="totals-row"><span>Net paid</span><span>${escapeHtml(formatReceiptMoney(data.netPaid))}</span></div>
        </div>`
      : "";

  const contactLines: string[] = [];
  if (data.settings.showBusinessPhone && data.business.phone) {
    contactLines.push(escapeHtml(data.business.phone));
  }
  if (data.settings.showBusinessEmail && data.business.email) {
    contactLines.push(escapeHtml(data.business.email));
  }

  const metaLines: string[] = [`Location: ${escapeHtml(data.location.name)}`];
  if (data.settings.showCashier && data.employee) {
    metaLines.push(`Cashier: ${escapeHtml(data.employee.name)}`);
  }
  if (data.settings.showCustomer && data.customer) {
    metaLines.push(`Customer: ${escapeHtml(data.customer.name)}`);
    if (data.customer.email) {
      metaLines.push(escapeHtml(data.customer.email));
    }
  }

  const statusBadge =
    data.isRefunded || data.isPartiallyRefunded
      ? `<div class="status-badge">${data.isRefunded ? "REFUNDED" : "PARTIALLY REFUNDED"}</div>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Receipt ${escapeHtml(data.receiptNumber)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      line-height: 1.4;
      color: #0f172a;
      background: #fff;
      padding: 16px;
    }
    .receipt {
      max-width: 80mm;
      margin: 0 auto;
    }
    .center { text-align: center; }
    .business-name { font-size: 16px; font-weight: 700; margin-bottom: 4px; }
    .muted { color: #64748b; font-size: 11px; }
    .divider { border-top: 1px dashed #cbd5e1; margin: 12px 0; }
    .meta { margin: 8px 0; }
    .meta div { margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 10px; color: #64748b; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; }
    td { padding: 6px 0; vertical-align: top; border-bottom: 1px solid #f1f5f9; }
    .item-name { width: 45%; }
    .sku { font-size: 10px; color: #64748b; }
    .qty { width: 12%; text-align: center; }
    .price, .total { text-align: right; white-space: nowrap; }
    .totals { margin-top: 8px; }
    .totals-row { display: flex; justify-content: space-between; margin: 3px 0; }
    .totals-row.grand { font-weight: 700; font-size: 14px; margin-top: 6px; padding-top: 6px; border-top: 1px solid #0f172a; }
    .section { margin-top: 12px; }
    .section-title { font-weight: 700; margin-bottom: 6px; }
    .payment-row, .refund-row { display: flex; justify-content: space-between; margin: 3px 0; }
    .payment-extra, .refund-reason { font-size: 10px; color: #64748b; margin-bottom: 4px; }
    .footer { margin-top: 16px; text-align: center; white-space: pre-wrap; }
    .status-badge { display: inline-block; margin-top: 8px; padding: 2px 8px; border: 1px solid #f59e0b; color: #b45309; font-size: 10px; font-weight: 700; }
    @media print {
      body { padding: 0; }
      @page { margin: 4mm; size: 80mm auto; }
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="center">
      <div class="business-name">${businessName}</div>
      ${locationLines ? `<div class="muted">${locationLines}</div>` : ""}
      ${contactLines.length ? `<div class="muted">${contactLines.join("<br />")}</div>` : ""}
      ${statusBadge}
    </div>
    <div class="divider"></div>
    <div class="meta">
      <div><strong>Order</strong> ${escapeHtml(data.orderNumber)}</div>
      <div><strong>Receipt</strong> ${escapeHtml(data.receiptNumber)}</div>
      <div>${dateStr}</div>
      ${metaLines.map((line) => `<div>${line}</div>`).join("")}
    </div>
    <div class="divider"></div>
    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th class="qty">Qty</th>
          <th class="price">Price</th>
          <th class="total">Total</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>
    <div class="totals">
      <div class="totals-row"><span>Subtotal</span><span>${escapeHtml(formatReceiptMoney(data.subtotal))}</span></div>
      ${data.discountAmount > 0 ? `<div class="totals-row"><span>Discount</span><span>-${escapeHtml(formatReceiptMoney(data.discountAmount))}</span></div>` : ""}
      <div class="totals-row"><span>Tax</span><span>${escapeHtml(formatReceiptMoney(data.taxAmount))}</span></div>
      <div class="totals-row grand"><span>Total</span><span>${escapeHtml(formatReceiptMoney(data.total))}</span></div>
    </div>
    ${
      data.payments.length
        ? `<div class="section"><div class="section-title">Payment</div>${paymentsHtml}</div>`
        : ""
    }
    ${refundsHtml}
    ${data.settings.footer ? `<div class="footer">${escapeHtml(data.settings.footer)}</div>` : ""}
    ${data.settings.returnPolicy ? `<div class="footer muted">${escapeHtml(data.settings.returnPolicy)}</div>` : ""}
  </div>
</body>
</html>`;
}
