import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/auth";
import { hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { reportQuerySchema } from "@/lib/validations/expenses";
import { canViewAllExpenses } from "./expense-service";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

function parseDateOnly(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

export async function buildExpenseReport(
  ctx: AuthContext,
  raw: z.infer<typeof reportQuerySchema> | Record<string, string | undefined>
) {
  if (
    !hasPermission(ctx, PERMISSIONS.VIEW_EXPENSE_REPORTS) &&
    !hasPermission(ctx, PERMISSIONS.VIEW_TEAM_EXPENSES) &&
    !hasPermission(ctx, PERMISSIONS.VIEW_OWN_EXPENSES)
  ) {
    throw new Error(`Missing permission: ${PERMISSIONS.VIEW_EXPENSE_REPORTS}`);
  }

  const query = reportQuerySchema.parse(raw);
  const viewAll = canViewAllExpenses(ctx);

  const where: Prisma.ExpenseWhereInput = {
    businessId: ctx.business.id,
    deletedAt: null,
    ...(viewAll ? {} : { employeeId: ctx.employee.id }),
    ...(query.employeeId ? { employeeId: query.employeeId } : {}),
    ...(query.locationId ? { locationId: query.locationId } : {}),
    ...(query.department
      ? { department: { equals: query.department, mode: "insensitive" } }
      : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.companyCardId ? { companyCardId: query.companyCardId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.project
      ? { project: { equals: query.project, mode: "insensitive" } }
      : {}),
    ...(query.jobNumber
      ? { jobNumber: { equals: query.jobNumber, mode: "insensitive" } }
      : {}),
    ...(query.dateFrom || query.dateTo
      ? {
          purchaseDate: {
            ...(query.dateFrom ? { gte: parseDateOnly(query.dateFrom) } : {}),
            ...(query.dateTo ? { lte: parseDateOnly(query.dateTo) } : {}),
          },
        }
      : {}),
  };

  const expenses = await db.expense.findMany({
    where,
    include: {
      employee: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
      vendor: { select: { id: true, name: true } },
      companyCard: { select: { id: true, name: true, lastFour: true } },
      location: { select: { id: true, name: true } },
    },
    orderBy: { purchaseDate: "desc" },
    take: 5000,
  });

  const groups = new Map<string, { key: string; label: string; total: number; count: number }>();

  for (const expense of expenses) {
    let key = "unknown";
    let label = "Unknown";
    switch (query.groupBy) {
      case "employee":
        key = expense.employeeId;
        label = expense.employee.name;
        break;
      case "location":
        key = expense.locationId ?? "none";
        label = expense.location?.name ?? "Unassigned";
        break;
      case "department":
        key = expense.department ?? "none";
        label = expense.department ?? "Unassigned";
        break;
      case "vendor":
        key = expense.vendorId ?? expense.merchant;
        label = expense.vendor?.name ?? expense.merchant;
        break;
      case "category":
        key = expense.categoryId ?? "none";
        label = expense.category?.name ?? "Uncategorized";
        break;
      case "card":
        key = expense.companyCardId ?? "none";
        label = expense.companyCard
          ? `${expense.companyCard.name} ••${expense.companyCard.lastFour}`
          : "No card";
        break;
      case "date":
        key = expense.purchaseDate.toISOString().slice(0, 10);
        label = key;
        break;
      case "project":
        key = expense.project ?? "none";
        label = expense.project ?? "No project";
        break;
      case "job":
        key = expense.jobNumber ?? "none";
        label = expense.jobNumber ?? "No job";
        break;
      case "status":
      case "approval":
        key = expense.status;
        label = expense.status.replaceAll("_", " ");
        break;
    }
    const current = groups.get(key) ?? { key, label, total: 0, count: 0 };
    current.total += Number(expense.total);
    current.count += 1;
    groups.set(key, current);
  }

  const rows = [...groups.values()].sort((a, b) => b.total - a.total);
  const grandTotal = expenses.reduce((sum, e) => sum + Number(e.total), 0);

  return {
    groupBy: query.groupBy,
    format: query.format,
    rows,
    grandTotal,
    expenseCount: expenses.length,
    expenses: query.format === "json" ? expenses : undefined,
  };
}

type ReportExport = {
  rows: Array<{ key: string; label: string; total: number; count: number }>;
  grandTotal: number;
  expenseCount: number;
};

export function reportToCsv(report: ReportExport): string {
  const header = ["Group", "Count", "Total"];
  const lines = [
    header.join(","),
    ...report.rows.map((r) =>
      [`"${r.label.replaceAll('"', '""')}"`, r.count, r.total.toFixed(2)].join(",")
    ),
    `"Grand Total",${report.expenseCount},${report.grandTotal.toFixed(2)}`,
  ];
  return lines.join("\n");
}

/** Excel-compatible TSV (opens cleanly in Excel without an xlsx dependency). */
export function reportToExcelTsv(report: ReportExport): string {
  const header = ["Group", "Count", "Total"];
  const lines = [
    header.join("\t"),
    ...report.rows.map((r) => [r.label, r.count, r.total.toFixed(2)].join("\t")),
    ["Grand Total", report.expenseCount, report.grandTotal.toFixed(2)].join("\t"),
  ];
  return lines.join("\n");
}

export function reportToPdfText(
  report: ReportExport & { groupBy: string }
): string {
  const lines = [
    "NexaPOS Expense Report",
    `Grouped by: ${report.groupBy}`,
    `Expenses: ${report.expenseCount}`,
    `Grand total: $${report.grandTotal.toFixed(2)}`,
    "",
    ...report.rows.map(
      (r) => `${r.label.padEnd(32)} ${String(r.count).padStart(4)}  $${r.total.toFixed(2)}`
    ),
  ];
  return lines.join("\n");
}
