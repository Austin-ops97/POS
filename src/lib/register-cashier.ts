import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import type { AuthContext } from "@/lib/auth";
import { db } from "@/lib/db";

export const REGISTER_CASHIER_COOKIE = "nexapos_register_cashier";

type CashierPayload = {
  businessId: string;
  employeeId: string;
  employeeName: string;
  exp: number;
};

function getSigningSecret(): string {
  return (
    process.env.REGISTER_CASHIER_SECRET ||
    process.env.CLERK_SECRET_KEY ||
    process.env.STRIPE_SECRET_KEY ||
    "dev-register-cashier-secret"
  );
}

function encodePayload(payload: CashierPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", getSigningSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function decodePayload(token: string): CashierPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  const expected = createHmac("sha256", getSigningSecret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as CashierPayload;
    if (
      !parsed.businessId ||
      !parsed.employeeId ||
      !parsed.employeeName ||
      typeof parsed.exp !== "number"
    ) {
      return null;
    }
    if (Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function buildCashierCookieValue(input: {
  businessId: string;
  employeeId: string;
  employeeName: string;
  sessionTimeoutMinutes: number;
}): { value: string; maxAge: number; exp: number } {
  const maxAge = Math.max(1, input.sessionTimeoutMinutes) * 60;
  const exp = Date.now() + maxAge * 1000;
  return {
    value: encodePayload({
      businessId: input.businessId,
      employeeId: input.employeeId,
      employeeName: input.employeeName,
      exp,
    }),
    maxAge,
    exp,
  };
}

export function cashierCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export function readCashierTokenFromRequest(request: Request): string | null {
  const header = request.headers.get("cookie") || "";
  const match = header.match(
    new RegExp(`(?:^|;\\s*)${REGISTER_CASHIER_COOKIE}=([^;]+)`)
  );
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export async function setRegisterCashierCookie(input: {
  businessId: string;
  employeeId: string;
  employeeName: string;
  sessionTimeoutMinutes: number;
}) {
  const { value, maxAge } = buildCashierCookieValue(input);
  const jar = await cookies();
  jar.set(REGISTER_CASHIER_COOKIE, value, cashierCookieOptions(maxAge));
  return { maxAge, exp: Date.now() + maxAge * 1000 };
}

export async function clearRegisterCashierCookie() {
  const jar = await cookies();
  jar.set(REGISTER_CASHIER_COOKIE, "", { ...cashierCookieOptions(0), maxAge: 0 });
}

/**
 * Resolves which employee should be attributed on register/checkout actions.
 * When PIN-at-register is enabled, the signed cashier cookie must identify an
 * active employee in the same business. Otherwise falls back to the auth employee.
 */
export async function resolveRegisterCashier(
  ctx: AuthContext,
  request: Request
): Promise<{ id: string; name: string }> {
  const settings = await db.businessSetting.findUnique({
    where: { businessId: ctx.business.id },
    select: { requirePinAtRegister: true },
  });

  if (!settings?.requirePinAtRegister) {
    return { id: ctx.employee.id, name: ctx.employee.name };
  }

  const token = readCashierTokenFromRequest(request);
  if (!token) {
    throw new Error("Register PIN unlock required");
  }

  const payload = decodePayload(token);
  if (!payload || payload.businessId !== ctx.business.id) {
    throw new Error("Register PIN unlock required");
  }

  const employee = await db.employeeProfile.findFirst({
    where: {
      id: payload.employeeId,
      businessId: ctx.business.id,
      status: "ACTIVE",
      deletedAt: null,
    },
    select: { id: true, name: true },
  });

  if (!employee) {
    throw new Error("Register PIN unlock required");
  }

  return employee;
}

/** Pure helpers for unit tests */
export const __test = {
  encodePayload,
  decodePayload,
  getSigningSecret,
};
