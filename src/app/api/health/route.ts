import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isStripeConfigured, getStripePublishableKey } from "@/lib/stripe";
import { isClerkConfigured } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: {
    status: "healthy" | "degraded" | "unhealthy";
    app: { status: string };
    database: { status: string; latencyMs?: number };
    stripe: { configured: boolean; publishableKeyPresent: boolean };
    auth: { clerkConfigured: boolean };
  } = {
    status: "healthy",
    app: { status: "ok" },
    database: { status: "unknown" },
    stripe: {
      configured: isStripeConfigured(),
      publishableKeyPresent: Boolean(getStripePublishableKey()),
    },
    auth: { clerkConfigured: isClerkConfigured() },
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

  // Stripe optional — mark degraded in body, but keep HTTP 200 for load balancers
  // when the database is healthy (payments may be intentionally unset).
  if (!checks.stripe.configured && checks.status === "healthy") {
    checks.status = "degraded";
  }

  if (!checks.auth.clerkConfigured && process.env.NODE_ENV === "production") {
    checks.status = "unhealthy";
    httpStatus = 503;
  }

  return NextResponse.json(checks, { status: httpStatus });
}
