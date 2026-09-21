import { NextResponse } from "next/server";
import { requireAuth, hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { payrollDeductionConfigSchema } from "@/lib/validations/workforce";
import { createDeductionConfig, listDeductionConfigs } from "@/lib/workforce/pay-stub-service";
import { handleApiError } from "@/lib/api-utils";

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.VIEW_PAYROLL)) {
      throw new Error(`Missing permission: ${PERMISSIONS.VIEW_PAYROLL}`);
    }
    const configs = await listDeductionConfigs(ctx.business.id);
    return NextResponse.json({ configs });
  } catch (error) {
    return handleApiError(error, "GET /api/workforce/payroll/deduction-configs");
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.MANAGE_PAYROLL)) {
      throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_PAYROLL}`);
    }
    const data = payrollDeductionConfigSchema.parse(await request.json());
    const id = await createDeductionConfig({
      businessId: ctx.business.id,
      employeeId: ctx.employee.id,
      code: data.code,
      name: data.name,
      timing: data.timing,
      basis: data.basis,
      rate: data.rate,
      effectiveFrom: data.effectiveFrom,
      effectiveTo: data.effectiveTo,
      sortOrder: data.sortOrder,
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/workforce/payroll/deduction-configs");
  }
}
