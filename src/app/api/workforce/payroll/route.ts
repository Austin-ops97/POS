import { NextResponse } from "next/server";
import { requireAuth, hasPermission } from "@/lib/auth";
import { payrollBonusSchema } from "@/lib/validations/workforce";
import { PERMISSIONS } from "@/lib/permissions";
import { ensureWorkforceSettings } from "@/lib/workforce/settings";
import { computePayrollSummary, payrollToCsv } from "@/lib/workforce/payroll-service";
import { parseDateOnly } from "@/lib/workforce/pto-service";
import { db } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";
import { handleApiError } from "@/lib/api-utils";

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.VIEW_PAYROLL)) {
      throw new Error(`Missing permission: ${PERMISSIONS.VIEW_PAYROLL}`);
    }

    const { searchParams } = new URL(request.url);
    const periodStart = searchParams.get("periodStart");
    const periodEnd = searchParams.get("periodEnd");
    const format = searchParams.get("format");

    if (!periodStart || !periodEnd) {
      return NextResponse.json(
        { error: "periodStart and periodEnd are required" },
        { status: 400 }
      );
    }

    const settings = await ensureWorkforceSettings(ctx.business.id);
    const start = parseDateOnly(periodStart);
    const end = parseDateOnly(periodEnd);
    end.setHours(23, 59, 59, 999);

    const rows = await computePayrollSummary({
      businessId: ctx.business.id,
      periodStart: start,
      periodEnd: end,
      overtimeThreshold: Number(settings.overtimeThresholdHours),
      weekStartDay: settings.weekStartDay,
    });

    if (format === "csv") {
      const csv = payrollToCsv(rows);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="payroll-${periodStart}-${periodEnd}.csv"`,
        },
      });
    }

    const totals = rows.reduce(
      (acc, r) => ({
        scheduledHours: acc.scheduledHours + r.scheduledHours,
        actualHours: acc.actualHours + r.actualHours,
        totalPay: acc.totalPay + r.totalPay,
      }),
      { scheduledHours: 0, actualHours: 0, totalPay: 0 }
    );

    return NextResponse.json({ rows, totals, periodStart, periodEnd });
  } catch (error) {
    return handleApiError(error, "GET /api/workforce/payroll");
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.MANAGE_PAYROLL)) {
      throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_PAYROLL}`);
    }
    const body = await request.json();
    const data = payrollBonusSchema.parse(body);

    const employee = await db.employeeProfile.findFirst({
      where: {
        id: data.employeeId,
        businessId: ctx.business.id,
        deletedAt: null,
      },
    });

    if (!employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    const bonus = await db.payrollBonus.create({
      data: {
        businessId: ctx.business.id,
        employeeId: data.employeeId,
        amount: data.amount,
        description: data.description,
        payPeriodStart: parseDateOnly(data.payPeriodStart),
        payPeriodEnd: parseDateOnly(data.payPeriodEnd),
        createdById: ctx.employee.id,
      },
      include: {
        employee: { select: { id: true, name: true } },
      },
    });

    await createAuditLog({
      businessId: ctx.business.id,
      employeeId: ctx.employee.id,
      action: "PAYROLL_BONUS",
      entity: "PayrollBonus",
      entityId: bonus.id,
      details: data,
    });

    return NextResponse.json(bonus, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/workforce/payroll");
  }
}
