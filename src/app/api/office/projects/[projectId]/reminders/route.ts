import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { handleApiError, jsonError } from "@/lib/api-utils";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { createReminder, listProjectReminders } from "@/lib/office/reminder-service";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const { projectId } = await params;
    return NextResponse.json(await listProjectReminders(ctx, projectId));
  } catch (error) {
    return handleApiError(error, "GET /api/office/projects/[projectId]/reminders");
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const limit = await checkRateLimitAsync(`office:reminder:create:${ctx.employee.id}`, 30, 60_000);
    if (!limit.ok) return jsonError("Too many requests", 429);
    const { projectId } = await params;
    const reminder = await createReminder(ctx, projectId, await request.json());
    return NextResponse.json(reminder, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return jsonError(error.issues[0]?.message ?? "Invalid reminder", 400);
    return handleApiError(error, "POST /api/office/projects/[projectId]/reminders");
  }
}
