const SECRET_KEY =
  /password|pinhash|pin|access[_-]?token|refresh[_-]?token|client[_-]?secret|id[_-]?token|authorization|encryption[_-]?key|cipher|secret|ssn|socialsecurity|routing|accountnumber|credential/i;

const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;
const TOKEN_PARAM = /(access_token|refresh_token|client_secret|password|id_token)=([^&\s]+)/gi;
const BEARER = /bearer\s+[A-Za-z0-9._\-+/=]+/gi;

export function redactString(value: string): string {
  let next = value.replace(SSN, "***-**-****");
  next = next.replace(BEARER, "Bearer [redacted]");
  next = next.replace(TOKEN_PARAM, "$1=[redacted]");
  if (/^(sk_|rk_|ya29\.|eyJ)/.test(next) && next.length > 20) return "[redacted]";
  return next;
}

export function sanitizeAuditDetails(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[truncated]";
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean" || value == null) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => sanitizeAuditDetails(item, depth + 1));
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      output[key] = SECRET_KEY.test(key) ? "[redacted]" : sanitizeAuditDetails(item, depth + 1);
    }
    return output;
  }
  return undefined;
}

export function publicErrorMessage(message: string, fallback: string): string {
  const cleaned = redactString(message)
    .replace(/^Invalid (Plaid|social post|social|payroll|import):\s*/i, "")
    .trim();
  if (!cleaned || cleaned.length > 280 || /[\r\n]/.test(cleaned) || /node_modules|prisma\./i.test(cleaned)) {
    return fallback;
  }
  return cleaned;
}
