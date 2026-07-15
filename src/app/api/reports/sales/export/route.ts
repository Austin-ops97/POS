import { NextResponse } from "next/server";
import { requireAuth, requirePermission } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { PERMISSIONS } from "@/lib/permissions";
import { getReportsData } from "@/lib/queries";

function csvEscape(value: string | number) {
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    await requirePermission(ctx, PERMISSIONS.VIEW_REPORTS);

    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "csv";
    if (format !== "csv") {
      return NextResponse.json(
        { error: "Only csv format is supported" },
        { status: 400 }
      );
    }

    const data = await getReportsData(ctx);
    const lines: string[] = [
      "Section,Label,Metric,Value",
      ...data.salesByDay.map((row) =>
        ["SalesByDay", row.date, "sales", row.sales.toFixed(2)]
          .map(csvEscape)
          .join(",")
      ),
      ...data.salesByDay.map((row) =>
        ["SalesByDay", row.date, "orders", row.orders].map(csvEscape).join(",")
      ),
      ...data.topProducts.map((row) =>
        ["TopProducts", row.name, "revenue", row.revenue.toFixed(2)]
          .map(csvEscape)
          .join(",")
      ),
      ...data.topProducts.map((row) =>
        ["TopProducts", row.name, "quantity", row.quantity]
          .map(csvEscape)
          .join(",")
      ),
      ...data.employeeSales.map((row) =>
        ["Employees", row.name, "sales", row.sales.toFixed(2)]
          .map(csvEscape)
          .join(",")
      ),
      ...data.paymentMethods.map((row) =>
        ["Payments", row.method, "amount", row.amount.toFixed(2)]
          .map(csvEscape)
          .join(",")
      ),
    ];

    const body = lines.join("\n");
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="nexapos-sales-report.csv"`,
      },
    });
  } catch (error) {
    return handleApiError(error, "GET /api/reports/sales/export");
  }
}
