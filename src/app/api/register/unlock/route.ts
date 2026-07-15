import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { findEmployeeByPin } from "@/lib/workforce/time-clock-service";
import { handleApiError } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  buildCashierCookieValue,
  cashierCookieOptions,
  REGISTER_CASHIER_COOKIE,
} from "@/lib/register-cashier";

const unlockSchema = z.object({
  pin: z.string().regex(/^\d{4}$/, "PIN must be 4 digits"),
});

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();

    const rate = checkRateLimit(
      `register:unlock:${ctx.business.id}:${ctx.employee.id}`,
      20,
      60_000
    );
    if (!rate.ok) {
      return NextResponse.json(
        { error: "Too many unlock attempts. Try again shortly." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) },
        }
      );
    }

    const body = await request.json();
    const { pin } = unlockSchema.parse(body);

    const settings = await db.businessSetting.findUnique({
      where: { businessId: ctx.business.id },
      select: { requirePinAtRegister: true, sessionTimeoutMinutes: true },
    });

    const sessionTimeoutMinutes = settings?.sessionTimeoutMinutes ?? 30;

    let employeeId = ctx.employee.id;
    let employeeName = ctx.employee.name;

    if (settings?.requirePinAtRegister) {
      const employee = await findEmployeeByPin(ctx.business.id, pin);
      if (!employee) {
        return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
      }
      employeeId = employee.id;
      employeeName = employee.name;
    }

    const cookie = buildCashierCookieValue({
      businessId: ctx.business.id,
      employeeId,
      employeeName,
      sessionTimeoutMinutes,
    });

    const response = NextResponse.json({
      employeeId,
      employeeName,
      sessionTimeoutMinutes,
    });
    response.cookies.set(
      REGISTER_CASHIER_COOKIE,
      cookie.value,
      cashierCookieOptions(cookie.maxAge)
    );
    return response;
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
