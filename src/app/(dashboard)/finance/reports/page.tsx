import { requireAuth, hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { ExpenseReportsClient } from "@/components/expenses/reports-client";

export default async function FinanceReportsPage() {
  const ctx = await requireAuth();
  if (
    !hasPermission(ctx, PERMISSIONS.VIEW_EXPENSE_REPORTS) &&
    !hasPermission(ctx, PERMISSIONS.VIEW_OWN_EXPENSES)
  ) {
    redirect("/dashboard");
  }
  return (
    <ExpenseReportsClient
      canExport={
        hasPermission(ctx, PERMISSIONS.EXPORT_EXPENSES) || ctx.employee.role.name === "Owner"
      }
    />
  );
}
