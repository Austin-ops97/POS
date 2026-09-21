import { NextResponse } from "next/server";
import { requireAuth, hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError } from "@/lib/api-utils";
import { ensureWorkforceSettings } from "@/lib/workforce/settings";
import { computePayrollSummary } from "@/lib/workforce/payroll-service";
import { saveOvertimeCalculations } from "@/lib/workforce/overtime-store";
import { parseDateOnly } from "@/lib/workforce/pto-service";

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (!from || !to) throw new Error("Invalid overtime range");
    const viewAll =
      hasPermission(ctx, PERMISSIONS.MANAGE_WORKFORCE) ||
      hasPermission(ctx, PERMISSIONS.MANAGE_TIME_ENTRIES) ||
      hasPermission(ctx, PERMISSIONS.VIEW_PAYROLL);
    const showPay = hasPermission(ctx, PERMISSIONS.VIEW_PAYROLL) || hasPermission(ctx, PERMISSIONS.VIEW_COMPENSATION);
    const settings = await ensureWorkforceSettings(ctx.business.id);
    const periodStart = parseDateOnly(from);
    const periodEnd = parseDateOnly(to);
    const end = parseDateOnly(to);
    end.setHours(23, 59, 59, 999);
    const rows = await computePayrollSummary({
      businessId: ctx.business.id,
      periodStart,
      periodEnd: end,
      overtimeThreshold: Number(settings.overtimeThresholdHours),
      overtimeMultiplier: Number(settings.overtimeMultiplier),
      dailyOvertimeThresholdHours: settings.dailyOvertimeThresholdHours != null ? Number(settings.dailyOvertimeThresholdHours) : null,
      doubleTimeDailyThresholdHours:
        settings.doubleTimeDailyThresholdHours != null ? Number(settings.doubleTimeDailyThresholdHours) : null,
      doubleTimeMultiplier: Number(settings.doubleTimeMultiplier),
      weekStartDay: settings.weekStartDay,
      payPeriodType: settings.payPeriodType,
      paidBreaks: settings.paidBreaks,
      employeeIds: viewAll ? undefined : [ctx.employee.id],
    });
    await saveOvertimeCalculations({ businessId: ctx.business.id, periodStart, periodEnd, rows });
    return NextResponse.json({
      from,
      to,
      rules: rows[0]?.overtimeRules ?? null,
      rows: rows.map((row) => ({
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        regularHours: row.regularHours,
        overtimeHours: row.overtimeHours,
        doubleTimeHours: row.doubleTimeHours,
        totalHours: row.totalHours,
        regularPay: showPay ? row.regularPay : null,
        overtimePay: showPay ? row.overtimePay : null,
        grossPay: showPay ? row.grossPay : null,
        exempt: row.overtimeRules.exempt,
      })),
    });
  } catch (error) {
    return handleApiError(error, "GET /api/workforce/overtime");
  }
}
