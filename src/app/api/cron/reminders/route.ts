import { NextResponse } from "next/server";
import { claimDueReminders, processReminder } from "@/lib/office/reminder-service";
import { jsonError } from "@/lib/api-utils";

/**
 * Processes due project reminders every few minutes when the platform supports it.
 * Note: Vercel Hobby only allows daily crons — use a paid plan (or an external
 * scheduler hitting this route with CRON_SECRET) for a every-5-minutes cadence.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return jsonError("CRON_SECRET is not configured", 503);

  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) return jsonError("Unauthorized", 401);

  const claimed = await claimDueReminders(new Date(), 25);
  const results = [];
  for (const item of claimed) {
    results.push(await processReminder(item.id, item.claimToken));
  }

  return NextResponse.json({
    claimed: claimed.length,
    results,
  });
}

export async function POST(request: Request) {
  return GET(request);
}
