import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, hasPermission } from "@/lib/auth";
import { workforceSettingsSchema } from "@/lib/validations/workforce";
import { PERMISSIONS } from "@/lib/permissions";
import { ensureWorkforceSettings } from "@/lib/workforce/settings";
import { maskSensitiveId } from "@/lib/workforce/pay-stub";
import { createAuditLog } from "@/lib/audit";
import { handleApiError } from "@/lib/api-utils";

function stripEmployerReference<T extends { employerReference: string | null }>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "employerReference")) as Omit<T, "employerReference">;
}

export async function GET() {
  try {
    const ctx = await requireAuth();
    const settings = await ensureWorkforceSettings(ctx.business.id);
    if (!hasPermission(ctx, PERMISSIONS.MANAGE_WORKFORCE) && !hasPermission(ctx, PERMISSIONS.VIEW_PAYROLL)) {
      return NextResponse.json(stripEmployerReference(settings));
    }
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
    const employerReference = data.employerReference ? maskSensitiveId(data.employerReference) : null;
    const auditDetails = stripEmployerReference(data);

    await ensureWorkforceSettings(ctx.business.id);

    const settings = await db.workforceSettings.update({
      where: { businessId: ctx.business.id },
      data: { ...data, employerReference },
    });

    await createAuditLog({
      businessId: ctx.business.id,
      employeeId: ctx.employee.id,
      action: "WORKFORCE_CHANGE",
      entity: "WorkforceSettings",
      entityId: settings.id,
      details: auditDetails,
    });

    return NextResponse.json(settings);
  } catch (error) {
    return handleApiError(error, "PATCH /api/workforce/settings");
  }
}
