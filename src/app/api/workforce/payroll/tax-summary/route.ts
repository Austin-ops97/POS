import { NextResponse } from "next/server";
import { requireAuth, hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { getPayrollTaxSummary } from "@/lib/workforce/pay-stub-service";
import { handleApiError } from "@/lib/api-utils";

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.VIEW_PAYROLL)) {
      throw new Error(`Missing permission: ${PERMISSIONS.VIEW_PAYROLL}`);
    }
    const { searchParams } = new URL(request.url);
    const summary = await getPayrollTaxSummary({
      businessId: ctx.business.id,
      year: searchParams.get("year") ?? undefined,
      quarter: searchParams.get("quarter") ?? undefined,
      month: searchParams.get("month") ?? undefined,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
      payrollRunId: searchParams.get("runId") ?? undefined,
      employeeId: searchParams.get("employeeId") ?? undefined,
      taxType: searchParams.get("taxType") ?? undefined,
    });
    return NextResponse.json(summary);
  } catch (error) {
    return handleApiError(error, "GET /api/workforce/payroll/tax-summary");
  }
}
