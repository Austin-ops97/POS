import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { handleApiError, jsonError } from "@/lib/api-utils";
import {
  clearInboxNotifications,
  getNotificationPreferences,
  listInboxNotifications,
  markInboxNotificationsRead,
  updateNotificationPreferences,
} from "@/lib/notifications";

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const unreadOnly = new URL(request.url).searchParams.get("unread") === "true";
    const [items, preferences] = await Promise.all([
      listInboxNotifications(ctx, unreadOnly),
      getNotificationPreferences(ctx),
    ]);
    return NextResponse.json({ items, preferences });
  } catch (error) {
    return handleApiError(error, "GET /api/notifications");
  }
}

const patchSchema = z.object({
  ids: z.array(z.string()).optional(),
  markRead: z.boolean().optional(),
  clearAll: z.boolean().optional(),
  emailRemindersEnabled: z.boolean().optional(),
  inAppRemindersEnabled: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const body = patchSchema.parse(await request.json().catch(() => ({})));
    if (body.clearAll) {
      await clearInboxNotifications(ctx);
    } else if (body.markRead || body.ids?.length) {
      await markInboxNotificationsRead(ctx, body.ids);
    }
    const preferences =
      body.emailRemindersEnabled != null || body.inAppRemindersEnabled != null
        ? await updateNotificationPreferences(ctx, body)
        : await getNotificationPreferences(ctx);
    return NextResponse.json({ ok: true, preferences });
  } catch (error) {
    if (error instanceof z.ZodError) return jsonError(error.issues[0]?.message ?? "Invalid request", 400);
    return handleApiError(error, "POST /api/notifications");
  }
}
