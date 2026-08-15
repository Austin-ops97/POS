import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { runPtoAccrualJob } from "@/lib/workforce/pto-accrual-job";

export const maxDuration = 60;

/**
 * Grants due PTO according to each employee's accrual policy.
 * Runs daily. Vercel Cron sends Authorization: Bearer $CRON_SECRET.
 */
export async function GET(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  const result = await runPtoAccrualJob(new Date());
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  return GET(request);
}
