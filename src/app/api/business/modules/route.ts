import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { handleApiError } from "@/lib/api-utils";
import { moduleSettingsSchema } from "@/lib/validations";

export async function PATCH(request: Request) {
  try {
    const ctx = await requireAuth();
    const body = await request.json();
    const data = moduleSettingsSchema.parse(body);

    await db.$transaction(async (tx) => {
      for (const setting of data.modules) {
        await tx.moduleSetting.upsert({
          where: {
            businessId_module: {
              businessId: ctx.business.id,
              module: setting.module,
            },
          },
          create: {
            businessId: ctx.business.id,
            module: setting.module,
            enabled: setting.enabled,
          },
          update: {
            enabled: setting.enabled,
          },
        });
      }
    });

    const modules = await db.moduleSetting.findMany({
      where: { businessId: ctx.business.id },
      select: { module: true, enabled: true },
      orderBy: { module: "asc" },
    });

    return NextResponse.json({ modules });
  } catch (error) {
    return handleApiError(error, "PATCH /api/business/modules");
  }
}
