import { NextResponse } from "next/server";
import { requireAuth, hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { voidPayrollRun } from "@/lib/workforce/pay-stub-service";
import { handleApiError } from "@/lib/api-utils";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.MANAGE_PAYROLL)) {
      throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_PAYROLL}`);
    }
    const { id } = await params;
    const run = await voidPayrollRun({
      businessId: ctx.business.id,
      payrollRunId: id,
      employeeId: ctx.employee.id,
    });
    return NextResponse.json(run);
  } catch (error) {
    return handleApiError(error, "POST /api/workforce/payroll/runs/[id]/void");
  }
}
