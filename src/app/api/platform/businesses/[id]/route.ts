import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { CUSTOMER_CONFIGURABLE_MODULES } from "@/lib/modules";

type RouteParams = { params: Promise<{ id: string }> };
const moduleKeys = CUSTOMER_CONFIGURABLE_MODULES.map((item) => item.key);
const schema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  modules: z.array(z.object({ module: z.enum(moduleKeys as [typeof moduleKeys[number], ...typeof moduleKeys[number][]]), enabled: z.boolean() })).optional(),
});

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const admin = await requirePlatformAdmin();
    const { id } = await params;
    const data = schema.parse(await request.json());
    const business = await db.business.findFirst({ where: { id, deletedAt: null } });
    if (!business) throw new Error("Business not found");

    await db.$transaction(async (tx) => {
      if (data.status) await tx.business.update({ where: { id }, data: { status: data.status } });
      for (const setting of data.modules || []) {
        await tx.moduleSetting.upsert({
          where: { businessId_module: { businessId: id, module: setting.module } },
          create: { businessId: id, module: setting.module, enabled: setting.enabled },
          update: { enabled: setting.enabled },
        });
      }
      await tx.auditLog.create({
        data: {
          businessId: id,
          action: "SETTINGS_CHANGE",
          entity: "PlatformControl",
          entityId: id,
          details: { platformAdminUserId: admin.id, ...data },
        },
      });
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "PATCH /api/platform/businesses/[id]");
  }
}
