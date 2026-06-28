import PDFDocument from "pdfkit";
import type { ReceiptData } from "./receipt-data";
import {
  formatPaymentMethodLabel,
  formatReceiptMoney,
} from "./receipt-data";

function formatReceiptDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function generateReceiptPdf(data: ReceiptData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [226.77, 600], margin: 12 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const businessName = data.business.legalName || data.business.name;
    doc.fontSize(12).font("Helvetica-Bold").text(businessName, { align: "center" });
    doc.font("Helvetica").fontSize(8);

    for (const line of data.location.addressLines) {
      doc.text(line, { align: "center" });
    }
    if (data.settings.showBusinessPhone && data.business.phone) {
      doc.text(data.business.phone, { align: "center" });
    }
    if (data.settings.showBusinessEmail && data.business.email) {
      doc.text(data.business.email, { align: "center" });
    }

    doc.moveDown(0.5);
    doc.text(`Order ${data.orderNumber}`, { align: "center" });
    doc.text(`Receipt ${data.receiptNumber}`, { align: "center" });
    doc.text(formatReceiptDate(data.paidAt ?? data.createdAt), { align: "center" });
    doc.text(`Location: ${data.location.name}`, { align: "center" });

    if (data.settings.showCashier && data.employee) {
      doc.text(`Cashier: ${data.employee.name}`, { align: "center" });
    }
    if (data.settings.showCustomer && data.customer) {
      doc.text(`Customer: ${data.customer.name}`, { align: "center" });
    }

    doc.moveDown(0.5);
    doc.moveTo(12, doc.y).lineTo(214, doc.y).dash(2, { space: 2 }).stroke().undash();
    doc.moveDown(0.3);

    for (const item of data.lineItems) {
      const sku =
        data.settings.showSku && item.sku ? ` (${item.sku})` : "";
      doc.font("Helvetica-Bold").fontSize(8).text(`${item.quantity}x ${item.name}${sku}`);
      doc.font("Helvetica").text(
        `  ${formatReceiptMoney(item.unitPrice)} ea    ${formatReceiptMoney(item.total)}`,
        { align: "right" }
      );
    }

    doc.moveDown(0.3);
    doc.moveTo(12, doc.y).lineTo(214, doc.y).stroke();
    doc.moveDown(0.3);

    const totalLine = (label: string, amount: string) => {
      doc.text(`${label}: ${amount}`, { align: "right" });
    };

    totalLine("Subtotal", formatReceiptMoney(data.subtotal));
    if (data.discountAmount > 0) {
      totalLine("Discount", `-${formatReceiptMoney(data.discountAmount)}`);
    }
    totalLine("Tax", formatReceiptMoney(data.taxAmount));
    doc.font("Helvetica-Bold").fontSize(10);
    totalLine("Total", formatReceiptMoney(data.total));
    doc.font("Helvetica").fontSize(8);

    if (data.payments.length) {
      doc.moveDown(0.5);
      doc.font("Helvetica-Bold").text("Payment");
      doc.font("Helvetica");
      for (const payment of data.payments) {
        doc.text(
          `${formatPaymentMethodLabel(payment)}: ${formatReceiptMoney(payment.amount)}`
        );
        if (payment.method === "CASH" && payment.amountTendered != null) {
          doc.text(`  Tendered: ${formatReceiptMoney(payment.amountTendered)}`);
          if (payment.changeDue != null) {
            doc.text(`  Change: ${formatReceiptMoney(payment.changeDue)}`);
          }
        }
      }
    }

    if (data.refunds.length) {
      doc.moveDown(0.5);
      doc.font("Helvetica-Bold").text("Refunds");
      doc.font("Helvetica");
      for (const refund of data.refunds) {
        doc.text(
          `${formatReceiptDate(refund.createdAt)}: -${formatReceiptMoney(refund.amount)}`
        );
      }
      totalLine("Net paid", formatReceiptMoney(data.netPaid));
    }

    if (data.settings.footer) {
      doc.moveDown(0.5);
      doc.text(data.settings.footer, { align: "center" });
    }
    if (data.settings.returnPolicy) {
      doc.moveDown(0.3);
      doc.fontSize(7).text(data.settings.returnPolicy, { align: "center" });
    }

    doc.end();
  });
}
