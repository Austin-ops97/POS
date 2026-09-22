import JSZip from "jszip";
import {
  buildDigitalReceiptPdf,
  digitalReceiptPath,
  type DigitalReceiptSource,
} from "./digital-receipt-pdf";
import { receiptIndexCsv } from "./receipt-query";

export const RECEIPT_ARCHIVE_MAX_FILES = 80;
export const RECEIPT_ARCHIVE_MAX_BYTES = 30_000_000;

export function receiptArchiveSizeError(maxBytes = RECEIPT_ARCHIVE_MAX_BYTES) {
  if (maxBytes === RECEIPT_ARCHIVE_MAX_BYTES) {
    return "Invalid receipt download: the archive is larger than 30 MB. Narrow the date range.";
  }
  return `Invalid receipt download: the archive is larger than ${maxBytes} bytes. Narrow the selection.`;
}

export type ReceiptArchiveEntry = {
  filename: string;
  buffer: Buffer;
  mimeType: string;
  date: string;
  vendor: string;
  amount: string;
  category: string;
  employee: string;
  project: string;
  source: DigitalReceiptSource;
};

function failureMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Digital copy failed";
  return message.replace(/\s+/g, " ").trim() || "Digital copy failed";
}

/**
 * Original receipt files plus an optional CSV index.
 * When digital copies are requested, each receipt gets an experimental PDF
 * under digital/. A single bad receipt is skipped and recorded; size and
 * count caps still fail the whole archive.
 */
export async function assembleReceiptArchive(
  files: ReceiptArchiveEntry[],
  options: {
    includeCsv?: boolean;
    buildDigitalCopies?: boolean;
    maxBytes?: number;
  } = {}
) {
  if (files.length > RECEIPT_ARCHIVE_MAX_FILES) {
    throw new Error("Invalid receipt download: narrow the selection to 80 receipts or fewer");
  }
  const maxBytes = options.maxBytes ?? RECEIPT_ARCHIVE_MAX_BYTES;
  const buildDigitalCopies = options.buildDigitalCopies === true;
  const zip = new JSZip();
  let bytes = 0;
  const index: Array<{
    filename: string;
    date: string;
    vendor: string;
    amount: string;
    category: string;
    employee: string;
    project: string;
    digital?: string;
  }> = [];
  const errors: string[] = [];
  const digitalUsed = new Set<string>();

  for (const file of files) {
    bytes += file.buffer.length;
    if (bytes > maxBytes) throw new Error(receiptArchiveSizeError(maxBytes));
    zip.file(file.filename, file.buffer);

    let digital = "";
    if (buildDigitalCopies) {
      const digitalName = digitalReceiptPath(file.filename, digitalUsed);
      try {
        const pdf = await buildDigitalReceiptPdf({
          source: file.source,
          image: { data: file.buffer, mimeType: file.mimeType },
        });
        bytes += pdf.length;
        if (bytes > maxBytes) throw new Error(receiptArchiveSizeError(maxBytes));
        zip.file(digitalName, pdf);
        digital = digitalName;
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("Invalid receipt download:")) throw error;
        const message = failureMessage(error);
        errors.push(`${file.filename}: ${message}`);
        digital = `skipped: ${message}`;
      }
    }

    index.push({
      filename: file.filename,
      date: file.date,
      vendor: file.vendor,
      amount: file.amount,
      category: file.category,
      employee: file.employee,
      project: file.project,
      ...(buildDigitalCopies ? { digital } : {}),
    });
  }

  if (options.includeCsv !== false) {
    zip.file("receipt-index.csv", receiptIndexCsv(index, { includeDigital: buildDigitalCopies }));
  }
  if (buildDigitalCopies && errors.length) {
    zip.file("digital-errors.txt", `${errors.join("\n")}\n`);
  }
  const archive = await zip.generateAsync({ type: "nodebuffer" });
  return { archive, count: index.length };
}
