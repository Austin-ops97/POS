import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, hasPermission } from "@/lib/auth";
import { workforceSettingsSchema } from "@/lib/validations/workforce";
import { PERMISSIONS } from "@/lib/permissions";
import { ensureWorkforceSettings } from "@/lib/workforce/settings";
import { createAuditLog } from "@/lib/audit";
import { handleApiError } from "@/lib/api-utils";

export async function GET() {
  try {
    const ctx = await requireAuth();
    const settings = await ensureWorkforceSettings(ctx.business.id);
    return NextResponse.json(settings);
  } catch (error) {
    return handleApiError(error, "GET /api/workforce/settings");
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.MANAGE_WORKFORCE)) {
      throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_WORKFORCE}`);
    }

    const body = await request.json();
    const data = workforceSettingsSchema.parse(body);

    await ensureWorkforceSettings(ctx.business.id);

    const settings = await db.workforceSettings.update({
      where: { businessId: ctx.business.id },
      data,
    });

    await createAuditLog({
      businessId: ctx.business.id,
      employeeId: ctx.employee.id,
      action: "WORKFORCE_CHANGE",
      entity: "WorkforceSettings",
      entityId: settings.id,
      details: data,
    });

    return NextResponse.json(settings);
  } catch (error) {
    return handleApiError(error, "PATCH /api/workforce/settings");
  }
}
