import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { handleApiError, jsonError } from "@/lib/api-utils";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { testSendReminder } from "@/lib/office/reminder-service";
import { reminderTestSendSchema } from "@/lib/validations/reminders";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const limit = await checkRateLimitAsync(`office:reminder:test:${ctx.employee.id}`, 5, 60_000);
    if (!limit.ok) return jsonError("Too many test sends. Wait a minute and try again.", 429);
    const { id } = await params;
    const body = reminderTestSendSchema.parse(await request.json().catch(() => ({})));
    return NextResponse.json(await testSendReminder(ctx, id, body.to));
  } catch (error) {
    if (error instanceof z.ZodError) return jsonError(error.issues[0]?.message ?? "Invalid request", 400);
    return handleApiError(error, "POST /api/office/reminders/[id]/test");
  }
}
