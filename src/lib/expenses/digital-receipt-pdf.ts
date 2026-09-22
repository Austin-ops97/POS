import PDFDocument from "pdfkit";
import { ocrReviewNote, parseReceiptText } from "./ocr";

export type DigitalLineItem = {
  description: string;
  amount: number;
  quantity?: number;
};

/** Stored expense fields plus any OCR text already saved on the receipt or expense. */
export type DigitalReceiptSource = {
  merchant?: string | null;
  date?: string | null;
  total?: number | null;
  tax?: number | null;
  lineItems?: Array<{ description: string; quantity?: number | null; amount: number }>;
  ocrText?: string | null;
};

export type DigitalReceiptFields = {
  merchant: string;
  date: string;
  total: number | null;
  tax: number | null;
  lineItems: DigitalLineItem[];
  reviewNote: string;
};

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function money(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `$${value.toFixed(2)}`;
}

function storedLineItems(source: DigitalReceiptSource): DigitalLineItem[] {
  return (source.lineItems ?? [])
    .filter((line) => line.description.trim().length > 0 && Number.isFinite(line.amount))
    .map((line) => ({
      description: line.description.trim(),
      amount: line.amount,
      ...(line.quantity != null && Number.isFinite(line.quantity) && line.quantity > 0
        ? { quantity: line.quantity }
        : {}),
    }));
}

/**
 * Prefer stored expense fields. Fill gaps from the existing receipt-text parser
 * when OCR text was already saved. Does not run a second OCR engine.
 */
export function resolveDigitalReceiptFields(source: DigitalReceiptSource): DigitalReceiptFields {
  const ocrText = source.ocrText?.trim() ?? "";
  const parsed = ocrText ? parseReceiptText(ocrText) : null;
  const lineItems = storedLineItems(source);
  const items = lineItems.length
    ? lineItems
    : (parsed?.items ?? []).map((item) => ({
        description: item.description,
        amount: item.amount,
        ...(item.quantity != null ? { quantity: item.quantity } : {}),
      }));
  const merchant = source.merchant?.trim() || parsed?.merchant || "";
  const storedDate = source.date?.trim() ?? "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(storedDate) ? storedDate : parsed?.date || "";
  const total =
    source.total != null && Number.isFinite(source.total) ? source.total : (parsed?.total ?? null);
  const tax = source.tax != null && Number.isFinite(source.tax) ? source.tax : (parsed?.tax ?? null);

  if (!merchant && !date && total == null && tax == null && items.length === 0) {
    throw new Error("No stored OCR or expense fields were available");
  }

  const confidence =
    parsed?.confidence ??
    (merchant && date && total != null ? 80 : 40);
  const reviewNote =
    ocrReviewNote(confidence) ?? "Review this experimental copy before relying on it.";

  return { merchant, date, total, tax, lineItems: items, reviewNote };
}

/** JPEG and PNG can be placed in the PDF. Other originals keep the structured fields only. */
export function classifyReceiptImage(data: Buffer, mimeType: string): "jpeg" | "png" | null {
  const mime = mimeType.toLowerCase();
  const looksPng = data.length >= 8 && data.subarray(0, 8).equals(PNG_SIGNATURE);
  const looksJpeg = data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (looksPng) {
    const ihdr = data.length >= 24 && data.subarray(12, 16).toString("ascii") === "IHDR" && data.readUInt32BE(8) === 13;
    if (!ihdr) throw new Error("Receipt image could not be read");
    return "png";
  }
  if (looksJpeg) {
    if (data.length < 32) throw new Error("Receipt image could not be read");
    return "jpeg";
  }
  if (mime === "image/jpeg" || mime === "image/jpg" || mime === "image/png") {
    throw new Error("Receipt image could not be read");
  }
  return null;
}

export function digitalReceiptPath(filename: string, used: Set<string>): string {
  const stem = filename.replace(/\.[^.]+$/, "").replace(/^.*\//, "").trim() || "receipt";
  let path = `digital/${stem}_digital.pdf`;
  let suffix = 2;
  while (used.has(path.toLowerCase())) {
    path = `digital/${stem}-${suffix}_digital.pdf`;
    suffix += 1;
  }
  used.add(path.toLowerCase());
  return path;
}

export async function buildDigitalReceiptPdf(input: {
  source: DigitalReceiptSource;
  image?: { data: Buffer; mimeType: string } | null;
}): Promise<Buffer> {
  const fields = resolveDigitalReceiptFields(input.source);
  const imageKind = input.image ? classifyReceiptImage(input.image.data, input.image.mimeType) : null;
  const image = imageKind && input.image ? input.image.data : null;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 36, compress: false });
    const chunks: Buffer[] = [];
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      if (error) {
        reject(error instanceof Error ? error : new Error("Receipt image could not be read"));
        return;
      }
      resolve(Buffer.concat(chunks));
    };
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => finish());
    doc.on("error", (error) => finish(error));

    try {
      doc.font("Helvetica-Bold").fontSize(14).text("Experimental digital copy");
      doc.moveDown(0.25);
      doc.font("Helvetica").fontSize(9).fillColor("#92400e").text(
        "Experimental. This PDF was built from stored expense fields and OCR already saved on the receipt. Results may need review."
      );
      doc.fillColor("#000000");
      doc.moveDown(0.4);
      doc.fontSize(9).text(fields.reviewNote);
      doc.moveDown(0.8);

      doc.font("Helvetica-Bold").fontSize(11).text("Receipt fields");
      doc.moveDown(0.3);
      doc.font("Helvetica").fontSize(10);
      doc.text(`Merchant: ${fields.merchant || "n/a"}`);
      doc.text(`Date: ${fields.date || "n/a"}`);
      doc.text(`Total: ${money(fields.total)}`);
      doc.text(`Tax: ${money(fields.tax)}`);

      doc.moveDown(0.8);
      doc.font("Helvetica-Bold").fontSize(11).text("Line items");
      doc.moveDown(0.3);
      doc.font("Helvetica").fontSize(10);
      if (!fields.lineItems.length) {
        doc.text("No line items were stored or read from OCR.");
      } else {
        for (const item of fields.lineItems) {
          const qty = item.quantity != null ? `${item.quantity} x ` : "";
          doc.text(`${qty}${item.description}    ${money(item.amount)}`);
        }
      }

      doc.moveDown(0.8);
      doc.font("Helvetica-Bold").fontSize(11).text("Receipt image");
      doc.moveDown(0.3);
      doc.font("Helvetica").fontSize(9);
      if (image) {
        const maxWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const bottom = doc.page.height - doc.page.margins.bottom;
        if (bottom - doc.y < 180) doc.addPage();
        const maxHeight = Math.max(120, Math.min(480, doc.page.height - doc.page.margins.bottom - doc.y));
        doc.image(image, doc.page.margins.left, doc.y, { fit: [maxWidth, maxHeight] });
      } else {
        doc.text("The original file is not a JPEG or PNG, so this copy lists the structured fields only.");
      }

      doc.moveDown(1);
      doc.fontSize(8).fillColor("#64748b").text(
        "Experimental OCR digital copy. Compare the fields with the original receipt before you rely on them."
      );
      doc.end();
    } catch (error) {
      finish(error instanceof Error ? error : new Error("Receipt image could not be read"));
    }
  });
}
