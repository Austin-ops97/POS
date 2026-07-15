import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { listNotifications, markNotificationsRead } from "@/lib/expenses/notifications";

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get("unread") === "true";
    const items = await listNotifications(ctx.employee.id, unreadOnly);
    return NextResponse.json(items);
  } catch (error) {
    return handleApiError(error, "GET /api/expenses/notifications");
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const body = await request.json().catch(() => ({}));
    await markNotificationsRead(ctx.employee.id, body.ids);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, "POST /api/expenses/notifications");
  }
}
