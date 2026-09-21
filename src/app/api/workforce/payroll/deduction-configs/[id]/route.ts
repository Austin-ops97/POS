import { NextResponse } from "next/server";
import { requireAuth, hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { payrollConfigEndSchema } from "@/lib/validations/workforce";
import { endDeductionConfig } from "@/lib/workforce/pay-stub-service";
import { handleApiError } from "@/lib/api-utils";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.MANAGE_PAYROLL)) {
      throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_PAYROLL}`);
    }
    const { id } = await params;
    const data = payrollConfigEndSchema.parse(await request.json());
    await endDeductionConfig({
      businessId: ctx.business.id,
      employeeId: ctx.employee.id,
      id,
      effectiveTo: data.effectiveTo,
    });
    return NextResponse.json({ id, effectiveTo: data.effectiveTo });
  } catch (error) {
    return handleApiError(error, "PATCH /api/workforce/payroll/deduction-configs/[id]");
  }
}
