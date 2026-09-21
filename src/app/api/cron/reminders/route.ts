import { NextResponse } from "next/server";
import { claimDueReminders, processReminder } from "@/lib/office/reminder-service";
import { authorizeCron } from "@/lib/cron-auth";
import { publishDueSocialPosts } from "@/lib/social/social-service";
import { safeSocialMessage } from "@/lib/social/providers";

/**
 * Processes due project reminders.
 * Vercel Hobby only allows daily crons — vercel.json schedules this at 08:00 UTC.
 * `.github/workflows/reminder-cron.yml` also hits this route every five minutes
 * with Authorization: Bearer $CRON_SECRET so due reminders are not stuck until 08:00 UTC.
 */
export async function GET(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  const claimed = await claimDueReminders(new Date(), 25);
  const results = [];
  for (const item of claimed) {
    results.push(await processReminder(item.id, item.claimToken));
  }

  let social = { published: 0, error: null as string | null };
  try {
    const published = await publishDueSocialPosts();
    social = { published: published.published, error: null };
  } catch (error) {
    social = { published: 0, error: safeSocialMessage(error instanceof Error ? error.message : "social publish failed") };
  }

  return NextResponse.json({
    claimed: claimed.length,
    results,
    social,
  });
}

export async function POST(request: Request) {
  return GET(request);
}
