import { NextResponse } from "next/server";
import { requireAuth, hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { payrollProcessSchema } from "@/lib/validations/workforce";
import { listPayrollRuns, processPayrollRun } from "@/lib/workforce/pay-stub-service";
import { handleApiError } from "@/lib/api-utils";

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.VIEW_PAYROLL)) {
      throw new Error(`Missing permission: ${PERMISSIONS.VIEW_PAYROLL}`);
    }
    const runs = await listPayrollRuns(ctx.business.id);
    return NextResponse.json({ runs });
  } catch (error) {
    return handleApiError(error, "GET /api/workforce/payroll/runs");
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.MANAGE_PAYROLL)) {
      throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_PAYROLL}`);
    }
    const data = payrollProcessSchema.parse(await request.json());
    const run = await processPayrollRun({
      businessId: ctx.business.id,
      processedById: ctx.employee.id,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      payDate: data.payDate,
      adjustments: data.adjustments,
    });
    return NextResponse.json(run, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/workforce/payroll/runs");
  }
}
