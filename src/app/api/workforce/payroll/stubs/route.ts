import { NextResponse } from "next/server";
import { requireAuth, hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { listPayStubs } from "@/lib/workforce/pay-stub-service";
import { handleApiError } from "@/lib/api-utils";

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.VIEW_PAYROLL)) {
      throw new Error(`Missing permission: ${PERMISSIONS.VIEW_PAYROLL}`);
    }
    const { searchParams } = new URL(request.url);
    const stubs = await listPayStubs({
      businessId: ctx.business.id,
      employeeId: searchParams.get("employeeId") ?? undefined,
      payrollRunId: searchParams.get("runId") ?? undefined,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
    });
    return NextResponse.json({ stubs });
  } catch (error) {
    return handleApiError(error, "GET /api/workforce/payroll/stubs");
  }
}
