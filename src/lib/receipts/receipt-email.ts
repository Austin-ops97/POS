import { Resend } from "resend";
import { captureMonitoringEvent } from "@/lib/monitoring";
import type { ReceiptData } from "./receipt-data";
import { renderReceiptHtml, renderReceiptPlainText } from "./receipt-html";
import { markReceiptEmailed } from "./receipt-data";
import { generateReceiptPdf } from "./receipt-pdf";
import { receiptPdfFilename } from "./receipt-filename";

export class ReceiptEmailConfigError extends Error {
  readonly code = "RECEIPT_EMAIL_NOT_CONFIGURED" as const;

  constructor() {
    super(
      "Receipt email is not configured. Set RESEND_API_KEY and RECEIPTS_FROM_EMAIL."
    );
    this.name = "ReceiptEmailConfigError";
  }
}

export class ReceiptEmailSendError extends Error {
  readonly code = "RECEIPT_EMAIL_FAILED" as const;

  constructor(message: string) {
    super(message);
    this.name = "ReceiptEmailSendError";
  }
}

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return null;
  return new Resend(apiKey);
}

export function isReceiptEmailConfigured(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY?.trim() && process.env.RECEIPTS_FROM_EMAIL?.trim()
  );
}

export async function buildReceiptEmailMessage(data: ReceiptData) {
  const businessName = data.business.legalName || data.business.name;
  const pdf = await generateReceiptPdf(data);
  if (!pdf.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new ReceiptEmailSendError("Could not build the receipt PDF.");
  }
  const filename = receiptPdfFilename(data.orderNumber);
  return {
    subject: `Receipt from ${businessName} - Order #${data.orderNumber}`,
    html: renderReceiptHtml(data),
    text: renderReceiptPlainText(data),
    attachments: [
      {
        filename,
        content: pdf,
        contentType: "application/pdf",
      },
    ],
  };
}

export async function sendReceiptEmail(params: {
  businessId: string;
  orderId: string;
  data: ReceiptData;
  to: string;
}): Promise<{ id?: string }> {
  const { businessId, orderId, data, to } = params;

  const fromEmail = process.env.RECEIPTS_FROM_EMAIL?.trim();
  const resend = getResendClient();

  if (!resend || !fromEmail) {
    captureMonitoringEvent(
      {
        type: "receipt_email_failure",
        businessId,
        orderId,
        error: "Receipt email not configured (missing RESEND_API_KEY or RECEIPTS_FROM_EMAIL)",
      },
      "warning"
    );
    throw new ReceiptEmailConfigError();
  }

  const replyTo =
    process.env.RECEIPTS_REPLY_TO_EMAIL?.trim() ||
    (data.settings.showBusinessEmail ? data.business.email : undefined);

  try {
    const message = await buildReceiptEmailMessage(data);
    const result = await resend.emails.send({
      from: fromEmail,
      to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      attachments: message.attachments,
      ...(replyTo ? { reply_to: replyTo } : {}),
    });

    if (result.error) {
      throw new ReceiptEmailSendError(result.error.message);
    }

    await markReceiptEmailed(businessId, orderId, to);

    return { id: result.data?.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    captureMonitoringEvent({
      type: "receipt_email_failure",
      businessId,
      orderId,
      error: `Receipt email failed: ${message}`,
    });
    if (error instanceof ReceiptEmailConfigError || error instanceof ReceiptEmailSendError) {
      throw error;
    }
    throw new ReceiptEmailSendError(message);
  }
}
