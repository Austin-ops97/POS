import { createHash, createPublicKey, timingSafeEqual, verify } from "crypto";

export type PlaidVerificationJwk = {
  kty: string;
  crv: string;
  x: string;
  y: string;
  kid?: string;
  alg?: string;
  use?: string;
  expired_at?: number | null;
};

export type PlaidWebhookPayload = {
  webhook_type?: string;
  webhook_code?: string;
  item_id?: string;
  environment?: string;
  error?: { error_code?: string; error_message?: string } | null;
};

const MAX_TOKEN_AGE_SECONDS = 5 * 60;

function base64UrlDecode(value: string): Buffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

function safeEqualHex(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function plaidWebhookBodyHash(rawBody: string): string {
  return createHash("sha256").update(rawBody).digest("hex");
}

/** Reads the `kid` from an unverified ES256 JWT. Signature checks happen later. */
export function plaidWebhookKeyId(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[0]) return null;
  try {
    const header = JSON.parse(base64UrlDecode(parts[0]).toString("utf8")) as { alg?: string; kid?: string };
    if (header.alg !== "ES256" || !header.kid?.trim()) return null;
    return header.kid.trim();
  } catch {
    return null;
  }
}

export function verifyPlaidWebhookJwt(input: {
  jwt: string;
  rawBody: string;
  jwk: PlaidVerificationJwk;
  now?: number;
}): { ok: true } | { ok: false; reason: string } {
  const parts = input.jwt.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  if (input.jwk.expired_at != null) return { ok: false, reason: "expired_key" };
  if (input.jwk.kty !== "EC" || input.jwk.crv !== "P-256" || !input.jwk.x || !input.jwk.y) {
    return { ok: false, reason: "key" };
  }

  let payload: { iat?: number; request_body_sha256?: string };
  try {
    const key = createPublicKey({
      key: { kty: "EC", crv: "P-256", x: input.jwk.x, y: input.jwk.y },
      format: "jwk",
    });
    const signed = Buffer.from(`${parts[0]}.${parts[1]}`);
    const signature = base64UrlDecode(parts[2]);
    const valid = verify("sha256", signed, { key, dsaEncoding: "ieee-p1363" }, signature);
    if (!valid) return { ok: false, reason: "signature" };
    payload = JSON.parse(base64UrlDecode(parts[1]).toString("utf8")) as { iat?: number; request_body_sha256?: string };
  } catch {
    return { ok: false, reason: "signature" };
  }

  const now = input.now ?? Math.floor(Date.now() / 1000);
  if (typeof payload.iat !== "number" || !Number.isFinite(payload.iat)) return { ok: false, reason: "iat" };
  if (payload.iat > now + 60 || now - payload.iat > MAX_TOKEN_AGE_SECONDS) return { ok: false, reason: "iat" };
  if (!payload.request_body_sha256 || !safeEqualHex(payload.request_body_sha256, plaidWebhookBodyHash(input.rawBody))) {
    return { ok: false, reason: "body" };
  }
  return { ok: true };
}

/** What EmeraldOne should do after the JWT and body hash already verified. */
export function plaidWebhookAction(body: PlaidWebhookPayload): "sync" | "error" | "disconnect" | "ignore" {
  const type = body.webhook_type;
  const code = body.webhook_code;
  if (
    type === "TRANSACTIONS" &&
    (code === "SYNC_UPDATES_AVAILABLE" ||
      code === "INITIAL_UPDATE" ||
      code === "HISTORICAL_UPDATE" ||
      code === "DEFAULT_UPDATE" ||
      code === "TRANSACTIONS_REMOVED")
  ) {
    return "sync";
  }
  if (type === "ITEM" && (code === "USER_PERMISSION_REVOKED" || code === "USER_ACCOUNT_REVOKED")) return "disconnect";
  if (type === "ITEM" && (code === "ERROR" || code === "PENDING_EXPIRATION" || code === "PENDING_DISCONNECT")) {
    return "error";
  }
  return "ignore";
}
