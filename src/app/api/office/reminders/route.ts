import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { handleApiError, jsonError } from "@/lib/api-utils";
import { listBusinessReminders } from "@/lib/office/reminder-service";
import { reminderListQuerySchema } from "@/lib/validations/reminders";

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const search = Object.fromEntries(new URL(request.url).searchParams.entries());
    const query = reminderListQuerySchema.parse(search);
    return NextResponse.json(
      await listBusinessReminders(ctx, {
        view: query.view,
        projectId: query.projectId,
        limit: query.limit,
      })
    );
  } catch (error) {
    if (error instanceof z.ZodError) return jsonError(error.issues[0]?.message ?? "Invalid query", 400);
    return handleApiError(error, "GET /api/office/reminders");
  }
}
