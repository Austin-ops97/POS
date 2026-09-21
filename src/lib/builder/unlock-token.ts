import { createHash, createHmac, timingSafeEqual } from "crypto";

export const BUILDER_UNLOCK_COOKIE = "e1_builder_unlock";
export const BUILDER_UNLOCK_TTL_SECONDS = 8 * 60 * 60;
export const BUILDER_UNLOCK_MIN_LENGTH = 16;

export type BuilderUnlockPayload = {
  uid: string;
  exp: number;
  purpose: "builder";
};

export function builderUnlockSecret(env: { [key: string]: string | undefined } = process.env): string | null {
  const value = env.BUILDER_UNLOCK_SECRET?.trim() ?? "";
  if (value.length < BUILDER_UNLOCK_MIN_LENGTH) return null;
  return value;
}

export function isBuilderUnlockConfigured(env: { [key: string]: string | undefined } = process.env): boolean {
  return builderUnlockSecret(env) != null;
}

/** SHA-256 both sides so length differences do not throw or leak timing. */
export function secretsMatch(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export function signBuilderUnlock(
  userId: string,
  secret: string,
  now = Date.now()
): { value: string; maxAge: number } {
  const payload: BuilderUnlockPayload = {
    uid: userId,
    exp: now + BUILDER_UNLOCK_TTL_SECONDS * 1000,
    purpose: "builder",
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return { value: `${body}.${sig}`, maxAge: BUILDER_UNLOCK_TTL_SECONDS };
}

export function readBuilderUnlockPayload(
  token: string,
  secret: string
): BuilderUnlockPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig || token.split(".").length !== 2) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as BuilderUnlockPayload;
    if (!parsed.uid || parsed.purpose !== "builder" || typeof parsed.exp !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function verifyBuilderUnlock(
  token: string,
  secret: string,
  userId: string,
  now = Date.now()
): boolean {
  const payload = readBuilderUnlockPayload(token, secret);
  if (!payload) return false;
  return payload.uid === userId && payload.exp > now;
}

export function unlockFailureMessage(reason: "mismatch" | "rate_limited" | "unconfigured"): {
  status: number;
  error: string;
  code: string;
} {
  if (reason === "rate_limited") {
    return {
      status: 429,
      error: "Too many unlock attempts. Try again later.",
      code: "BUILDER_UNLOCK_LOCKED",
    };
  }
  if (reason === "unconfigured") {
    return {
      status: 503,
      error: "Builder unlock is not configured",
      code: "BUILDER_NOT_CONFIGURED",
    };
  }
  return { status: 401, error: "Unlock failed.", code: "BUILDER_UNLOCK_FAILED" };
}
