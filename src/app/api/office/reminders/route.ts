import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { handleApiError, jsonError } from "@/lib/api-utils";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { createReminder, listBusinessReminders } from "@/lib/office/reminder-service";
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

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const limit = await checkRateLimitAsync(`office:reminder:create:${ctx.employee.id}`, 30, 60_000);
    if (!limit.ok) return jsonError("Too many requests", 429);
    const body = (await request.json()) as { projectId?: unknown };
    const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
    if (!projectId) return jsonError("Choose a project", 400);
    const reminder = await createReminder(ctx, projectId, body);
    return NextResponse.json(reminder, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return jsonError(error.issues[0]?.message ?? "Invalid reminder", 400);
    return handleApiError(error, "POST /api/office/reminders");
  }
}
