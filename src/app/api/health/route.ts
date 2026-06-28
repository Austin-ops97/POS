import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isStripeConfigured, getStripePublishableKey } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: {
    status: "healthy" | "degraded" | "unhealthy";
    app: { status: string };
    database: { status: string; latencyMs?: number };
    stripe: { configured: boolean; publishableKeyPresent: boolean };
  } = {
    status: "healthy",
    app: { status: "ok" },
    database: { status: "unknown" },
    stripe: {
      configured: isStripeConfigured(),
      publishableKeyPresent: Boolean(getStripePublishableKey()),
    },
  };

  let httpStatus = 200;

  try {
    const start = Date.now();
    await db.$queryRaw`SELECT 1`;
    checks.database = {
      status: "ok",
      latencyMs: Date.now() - start,
    };
  } catch {
    checks.database = { status: "error" };
    checks.status = "unhealthy";
    httpStatus = 503;
  }

  if (!checks.stripe.configured) {
    checks.status = checks.status === "unhealthy" ? "unhealthy" : "degraded";
    if (httpStatus === 200) httpStatus = 503;
  }

  return NextResponse.json(checks, { status: httpStatus });
}
