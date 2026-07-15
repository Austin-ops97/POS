import { createHash, randomUUID } from "crypto";
import { mkdir, writeFile, readFile } from "fs/promises";
import path from "path";

const LOCAL_PREFIX = "local://";

export type PersistedReceipt = {
  storageUrl: string;
  sizeBytes: number;
  contentHash: string;
};

function extensionForMime(mimeType: string, fileName: string) {
  if (mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) {
    return ".pdf";
  }
  if (mimeType === "image/png" || fileName.toLowerCase().endsWith(".png")) {
    return ".png";
  }
  if (mimeType === "image/webp") return ".webp";
  return ".jpg";
}

function parseDataUrl(storageUrl: string): { mimeType: string; buffer: Buffer } | null {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(storageUrl);
  if (!match) return null;
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

function localRoot() {
  return process.env.RECEIPT_STORAGE_PATH || path.join(process.cwd(), ".data", "receipts");
}

/**
 * Persist receipt bytes out of Postgres. Data URLs are written to disk
 * (or RECEIPT_STORAGE_PATH) and replaced with local:// keys. Remote http(s)
 * / already-persisted keys are left as-is.
 */
export async function persistReceiptBlob(input: {
  businessId: string;
  expenseId: string;
  fileName: string;
  mimeType: string;
  storageUrl: string;
}): Promise<PersistedReceipt> {
  if (
    input.storageUrl.startsWith(LOCAL_PREFIX) ||
    input.storageUrl.startsWith("http://") ||
    input.storageUrl.startsWith("https://")
  ) {
    const contentHash = createHash("sha256").update(input.storageUrl).digest("hex");
    return {
      storageUrl: input.storageUrl,
      sizeBytes: Buffer.byteLength(input.storageUrl),
      contentHash,
    };
  }

  const parsed = parseDataUrl(input.storageUrl);
  if (!parsed) {
    throw new Error("Unsupported receipt storage payload");
  }

  const contentHash = createHash("sha256").update(parsed.buffer).digest("hex");
  const ext = extensionForMime(input.mimeType || parsed.mimeType, input.fileName);
  const key = `${input.businessId}/${input.expenseId}/${contentHash.slice(0, 16)}-${randomUUID()}${ext}`;
  const absolute = path.join(localRoot(), key);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, parsed.buffer);

  return {
    storageUrl: `${LOCAL_PREFIX}${key}`,
    sizeBytes: parsed.buffer.length,
    contentHash,
  };
}

export async function readReceiptBlob(
  storageUrl: string
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  if (storageUrl.startsWith(LOCAL_PREFIX)) {
    const key = storageUrl.slice(LOCAL_PREFIX.length);
    const absolute = path.join(localRoot(), key);
    const buffer = await readFile(absolute);
    const mimeType = key.endsWith(".pdf")
      ? "application/pdf"
      : key.endsWith(".png")
        ? "image/png"
        : key.endsWith(".webp")
          ? "image/webp"
          : "image/jpeg";
    return { buffer, mimeType };
  }

  if (storageUrl.startsWith("data:")) {
    const parsed = parseDataUrl(storageUrl);
    if (!parsed) return null;
    return { buffer: parsed.buffer, mimeType: parsed.mimeType };
  }

  if (storageUrl.startsWith("http://") || storageUrl.startsWith("https://")) {
    const res = await fetch(storageUrl);
    if (!res.ok) return null;
    const mimeType = res.headers.get("content-type") || "application/octet-stream";
    const buffer = Buffer.from(await res.arrayBuffer());
    return { buffer, mimeType };
  }

  return null;
}

export function isLocalReceiptRef(storageUrl: string) {
  return storageUrl.startsWith(LOCAL_PREFIX);
}
