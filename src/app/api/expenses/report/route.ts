import { NextResponse } from "next/server";
import { requireAuth, hasPermission } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { PERMISSIONS } from "@/lib/permissions";
import {
  buildExpenseReport,
  reportToCsv,
  reportToExcelTsv,
  reportToPdfText,
} from "@/lib/expenses/report-service";

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    if (
      !hasPermission(ctx, PERMISSIONS.VIEW_EXPENSE_REPORTS) &&
      !hasPermission(ctx, PERMISSIONS.EXPORT_EXPENSES) &&
      !hasPermission(ctx, PERMISSIONS.VIEW_OWN_EXPENSES)
    ) {
      throw new Error(`Missing permission: ${PERMISSIONS.VIEW_EXPENSE_REPORTS}`);
    }
    const { searchParams } = new URL(request.url);
    const query = Object.fromEntries(searchParams.entries());
    const report = await buildExpenseReport(ctx, query);

    if (report.format === "csv") {
      if (!hasPermission(ctx, PERMISSIONS.EXPORT_EXPENSES) && ctx.employee.role.name !== "Owner") {
        // Allow own CSV for viewers with report access; still block excel/pdf without export if desired
      }
      return new NextResponse(reportToCsv(report), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="expense-report.csv"',
        },
      });
    }
    if (report.format === "excel") {
      if (!hasPermission(ctx, PERMISSIONS.EXPORT_EXPENSES) && ctx.employee.role.name !== "Owner") {
        throw new Error(`Missing permission: ${PERMISSIONS.EXPORT_EXPENSES}`);
      }
      return new NextResponse(reportToExcelTsv(report), {
        headers: {
          "Content-Type": "application/vnd.ms-excel; charset=utf-8",
          "Content-Disposition": 'attachment; filename="expense-report.xls"',
        },
      });
    }
    if (report.format === "pdf") {
      if (!hasPermission(ctx, PERMISSIONS.EXPORT_EXPENSES) && ctx.employee.role.name !== "Owner") {
        throw new Error(`Missing permission: ${PERMISSIONS.EXPORT_EXPENSES}`);
      }
      return new NextResponse(reportToPdfText(report), {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": 'attachment; filename="expense-report.txt"',
        },
      });
    }

    return NextResponse.json(report);
  } catch (error) {
    return handleApiError(error, "GET /api/expenses/report");
  }
}
