import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { handleApiError, jsonError } from "@/lib/api-utils";
import { deleteReminder, updateReminder } from "@/lib/office/reminder-service";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    return NextResponse.json(await updateReminder(ctx, id, await request.json()));
  } catch (error) {
    if (error instanceof z.ZodError) return jsonError(error.issues[0]?.message ?? "Invalid reminder", 400);
    return handleApiError(error, "PATCH /api/office/reminders/[id]");
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    return NextResponse.json(await deleteReminder(ctx, id));
  } catch (error) {
    return handleApiError(error, "DELETE /api/office/reminders/[id]");
  }
}
