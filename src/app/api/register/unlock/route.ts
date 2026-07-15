import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { findEmployeeByPin } from "@/lib/workforce/time-clock-service";
import { handleApiError } from "@/lib/api-utils";
import { db } from "@/lib/db";

const unlockSchema = z.object({
  pin: z.string().regex(/^\d{4}$/, "PIN must be 4 digits"),
});

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const body = await request.json();
    const { pin } = unlockSchema.parse(body);

    const settings = await db.businessSetting.findUnique({
      where: { businessId: ctx.business.id },
      select: { requirePinAtRegister: true, sessionTimeoutMinutes: true },
    });

    if (settings && !settings.requirePinAtRegister) {
      return NextResponse.json({
        employeeId: ctx.employee.id,
        employeeName: ctx.employee.name,
        sessionTimeoutMinutes: settings.sessionTimeoutMinutes ?? 30,
      });
    }

    const employee = await findEmployeeByPin(ctx.business.id, pin);
    if (!employee) {
      return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
    }

    return NextResponse.json({
      employeeId: employee.id,
      employeeName: employee.name,
      sessionTimeoutMinutes: settings?.sessionTimeoutMinutes ?? 30,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    return handleApiError(error, "POST /api/register/unlock");
  }
}
