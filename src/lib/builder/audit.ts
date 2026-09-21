import type { Prisma } from "@prisma/client";
import { sanitizeAuditDetails } from "@/lib/audit-redaction";

const DROPPED_KEYS = /secret|password|token|cipher|authorization|credential|pin/i;

/** Drops secret-like keys before the shared redactor runs. Never persist an unlock secret. */
export function safeBuilderAuditDetails(
  details: Record<string, unknown> | undefined
): Prisma.InputJsonValue | undefined {
  if (!details) return undefined;
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (DROPPED_KEYS.test(key)) continue;
    cleaned[key] = value;
  }
  return sanitizeAuditDetails(cleaned) as Prisma.InputJsonValue;
}
