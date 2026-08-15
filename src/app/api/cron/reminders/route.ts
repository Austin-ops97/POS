import { NextResponse } from "next/server";
import { claimDueReminders, processReminder } from "@/lib/office/reminder-service";
import { authorizeCron } from "@/lib/cron-auth";

/**
 * Processes due project reminders every few minutes when the platform supports it.
 * Note: Vercel Hobby only allows daily crons — use a paid plan (or an external
 * scheduler hitting this route with CRON_SECRET) for a every-5-minutes cadence.
 */
export async function GET(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;

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
