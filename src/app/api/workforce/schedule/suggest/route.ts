import { NextResponse } from "next/server";
import { requireAuth, hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError } from "@/lib/api-utils";
import { scheduleSuggestSchema } from "@/lib/validations/workforce";
import { buildScheduleSuggestion } from "@/lib/workforce/schedule-assist";

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.MANAGE_WORKFORCE)) {
      throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_WORKFORCE}`);
    }
    const data = scheduleSuggestSchema.parse(await request.json());
    const suggestion = await buildScheduleSuggestion({
      businessId: ctx.business.id,
      locationId: data.locationId,
      slots: data.slots,
    });
    return NextResponse.json(suggestion);
  } catch (error) {
    return handleApiError(error, "POST /api/workforce/schedule/suggest");
  }
}
