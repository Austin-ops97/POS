import { NextResponse } from "next/server";
import { requireAuth, hasPermission } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import { expenseSettingsSchema } from "@/lib/validations/expenses";
import { getExpenseSettings } from "@/lib/expenses/settings";

export async function GET() {
  try {
    const ctx = await requireAuth();
    const settings = await getExpenseSettings(ctx.business.id);
    return NextResponse.json(settings);
  } catch (error) {
    return handleApiError(error, "GET /api/expenses/settings");
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.MANAGE_EXPENSE_SETTINGS)) {
      throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_EXPENSE_SETTINGS}`);
    }
    const data = expenseSettingsSchema.parse(await request.json());
    const settings = await db.expenseSettings.upsert({
      where: { businessId: ctx.business.id },
      create: { businessId: ctx.business.id, ...data },
      update: data,
    });
    return NextResponse.json(settings);
  } catch (error) {
    return handleApiError(error, "PATCH /api/expenses/settings");
  }
}
