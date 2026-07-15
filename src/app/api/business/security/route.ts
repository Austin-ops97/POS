import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, hasPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError } from "@/lib/api-utils";
import { createAuditLog } from "@/lib/audit";

const securitySettingsSchema = z.object({
  requirePinAtRegister: z.boolean(),
  requireManagerPinRefund: z.boolean(),
  requireManagerRefund: z.boolean(),
  sessionTimeoutMinutes: z.number().int().min(5).max(480),
});

export async function PATCH(request: Request) {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.MANAGE_LOCATIONS)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const data = securitySettingsSchema.parse(body);

    const settings = await db.businessSetting.upsert({
      where: { businessId: ctx.business.id },
      create: {
        businessId: ctx.business.id,
        ...data,
      },
      update: data,
    });

    await createAuditLog({
      businessId: ctx.business.id,
      employeeId: ctx.employee.id,
      action: "SETTINGS_CHANGE",
      entity: "BusinessSetting",
      entityId: settings.id,
      details: data,
    });

    return NextResponse.json({
      requirePinAtRegister: settings.requirePinAtRegister,
      requireManagerPinRefund: settings.requireManagerPinRefund,
      requireManagerRefund: settings.requireManagerRefund,
      sessionTimeoutMinutes: settings.sessionTimeoutMinutes,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    return handleApiError(error, "PATCH /api/business/security");
  }
}
