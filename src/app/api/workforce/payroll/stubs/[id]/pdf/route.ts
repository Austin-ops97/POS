import { NextResponse } from "next/server";
import { requireAuth, hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { getPayStub, payStubPdfInput, recordPayStubDownload } from "@/lib/workforce/pay-stub-service";
import { renderPayStubPdf } from "@/lib/workforce/pay-stub-pdf";
import { handleApiError } from "@/lib/api-utils";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.VIEW_PAYROLL)) {
      throw new Error(`Missing permission: ${PERMISSIONS.VIEW_PAYROLL}`);
    }
    const { id } = await params;
    const stub = await getPayStub(ctx.business.id, id);
    if (!stub) throw new Error("Pay stub not found");
    const pdf = await renderPayStubPdf(payStubPdfInput(stub));
    await recordPayStubDownload({
      businessId: ctx.business.id,
      employeeId: ctx.employee.id,
      stubId: stub.id,
      payrollRunId: stub.payrollRunId,
    });
    const safeName = stub.employeeName.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "employee";
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${stub.payDate}_${safeName}_pay-stub.pdf"`,
      },
    });
  } catch (error) {
    return handleApiError(error, "GET /api/workforce/payroll/stubs/[id]/pdf");
  }
}
