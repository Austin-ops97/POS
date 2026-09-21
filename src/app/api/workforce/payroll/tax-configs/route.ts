import { NextResponse } from "next/server";
import { requireAuth, hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { payrollTaxConfigSchema } from "@/lib/validations/workforce";
import { createTaxConfig, listTaxConfigs } from "@/lib/workforce/pay-stub-service";
import { handleApiError } from "@/lib/api-utils";

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.VIEW_PAYROLL)) {
      throw new Error(`Missing permission: ${PERMISSIONS.VIEW_PAYROLL}`);
    }
    const configs = await listTaxConfigs(ctx.business.id);
    return NextResponse.json({ configs });
  } catch (error) {
    return handleApiError(error, "GET /api/workforce/payroll/tax-configs");
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.MANAGE_PAYROLL)) {
      throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_PAYROLL}`);
    }
    const data = payrollTaxConfigSchema.parse(await request.json());
    const id = await createTaxConfig({
      businessId: ctx.business.id,
      employeeId: ctx.employee.id,
      side: data.side,
      code: data.code,
      name: data.name,
      basis: data.basis,
      rate: data.rate,
      wageBase: data.wageBase,
      effectiveFrom: data.effectiveFrom,
      effectiveTo: data.effectiveTo,
      sortOrder: data.sortOrder,
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/workforce/payroll/tax-configs");
  }
}
