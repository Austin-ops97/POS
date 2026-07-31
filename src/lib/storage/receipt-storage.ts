import { createHash } from "node:crypto";

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export type PersistedReceipt = {
  storageUrl: string;
  sizeBytes: number;
  contentHash: string;
  data: Buffer;
  mimeType: string;
};

function parseDataUrl(value: string) {
  const match = /^data:([^;]+);base64,([a-z0-9+/=\r\n]+)$/i.exec(value);
  if (!match) throw new Error("Receipt upload must contain embedded file data");
  const mimeType = match[1].toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(mimeType)) throw new Error("Unsupported receipt file type");
  const data = Buffer.from(match[2], "base64");
  if (!data.length) throw new Error("Receipt file is empty");
  if (data.length > MAX_RECEIPT_BYTES) throw new Error("Receipt exceeds the 10 MB limit");
  return { mimeType, data };
}

/**
 * Receipt bytes live in Postgres so deployments remain portable and durable.
 * Remote URL and filesystem inputs are intentionally rejected to prevent SSRF
 * and serverless ephemeral-disk data loss.
 */
export async function persistReceiptBlob(input: {
  businessId: string;
  expenseId: string;
  fileName: string;
  mimeType: string;
  storageUrl: string;
}): Promise<PersistedReceipt> {
  void input.businessId;
  void input.expenseId;
  void input.fileName;
  const parsed = parseDataUrl(input.storageUrl);
  if (input.mimeType && input.mimeType.toLowerCase() !== parsed.mimeType) {
    throw new Error("Receipt content does not match its type");
  }
  const contentHash = createHash("sha256").update(parsed.data).digest("hex");
  return {
    storageUrl: `database://${contentHash}`,
    sizeBytes: parsed.data.length,
    contentHash,
    data: parsed.data,
    mimeType: parsed.mimeType,
  };
}

export async function readReceiptBlob(storageUrl: string, data?: Uint8Array | null, mimeType?: string) {
  if (!storageUrl.startsWith("database://") || !data) return null;
  return { buffer: Buffer.from(data), mimeType: mimeType || "application/octet-stream" };
}

export function isLocalReceiptRef() {
  return false;
}
