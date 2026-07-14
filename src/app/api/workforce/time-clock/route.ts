import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { timeClockActionSchema } from "@/lib/validations/workforce";
import {
  findEmployeeByPin,
  getActiveTimeEntry,
  getClockState,
  getTodayHours,
  executePunch,
  lookupEmployeeClockState,
} from "@/lib/workforce/time-clock-service";
import { handleApiError } from "@/lib/api-utils";

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const body = await request.json();
    const data = timeClockActionSchema.parse(body);

    const employee = await findEmployeeByPin(ctx.business.id, data.pin);
    if (!employee) {
      return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
    }

    if (data.action === "LOOKUP") {
      const result = await lookupEmployeeClockState(ctx.business.id, data.pin);
      return NextResponse.json({
        ...result,
        todayHours: Math.round(result.todayHours * 100) / 100,
      });
    }

    const result = await executePunch({
      businessId: ctx.business.id,
      employeeId: employee.id,
      employeeName: employee.name,
      action: data.action,
      locationId: data.locationId ?? ctx.location?.id,
    });

    return NextResponse.json({
      ...result,
      todayHours: Math.round(result.todayHours * 100) / 100,
    });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error, "POST /api/workforce/time-clock");
  }
}

export async function GET() {
  try {
    const ctx = await requireAuth();
    const activeEntry = await getActiveTimeEntry(ctx.employee.id);
    const clockState = getClockState(activeEntry);
    const todayHours = await getTodayHours(ctx.employee.id);

    return NextResponse.json({
      clockState,
      activeEntry: activeEntry
        ? {
            id: activeEntry.id,
            clockIn: activeEntry.clockIn,
            breaks: activeEntry.breaks,
          }
        : null,
      todayHours: Math.round(todayHours * 100) / 100,
    });
  } catch (error) {
    return handleApiError(error, "GET /api/workforce/time-clock");
  }
}
