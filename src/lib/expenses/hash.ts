import { createHash } from "crypto";

export function hashContent(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hashReceiptPayload(params: {
  storageUrl: string;
  contentHash?: string | null;
  fileName?: string;
  sizeBytes?: number;
}): string {
  if (params.contentHash) return params.contentHash;
  return hashContent(
    `${params.storageUrl.slice(0, 500)}|${params.fileName ?? ""}|${params.sizeBytes ?? 0}`
  );
}
