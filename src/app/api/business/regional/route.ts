import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { handleApiError } from "@/lib/api-utils";
import { regionalSettingsSchema } from "@/lib/validations";
import { isValidTimezone } from "@/lib/datetime";

export async function PATCH(request: Request) {
  try {
    const ctx = await requireAuth();
    const body = await request.json();
    const data = regionalSettingsSchema.parse(body);

    if (!isValidTimezone(data.displayTimezone)) {
      return NextResponse.json({ error: "Invalid timezone" }, { status: 400 });
    }

    const settings = await db.businessSetting.upsert({
      where: { businessId: ctx.business.id },
      create: {
        businessId: ctx.business.id,
        displayTimezone: data.displayTimezone,
      },
      update: {
        displayTimezone: data.displayTimezone,
      },
    });

    return NextResponse.json({
      displayTimezone: settings.displayTimezone,
    });
  } catch (error) {
    return handleApiError(error, "PATCH /api/business/regional");
  }
}
