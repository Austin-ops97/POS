import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError, jsonError } from "@/lib/api-utils";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { resendReminder } from "@/lib/office/reminder-service";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const limit = await checkRateLimitAsync(`office:reminder:resend:${ctx.employee.id}`, 10, 60_000);
    if (!limit.ok) return jsonError("Too many resends. Wait a minute and try again.", 429);
    const { id } = await params;
    return NextResponse.json(await resendReminder(ctx, id));
  } catch (error) {
    return handleApiError(error, "POST /api/office/reminders/[id]/resend");
  }
}
