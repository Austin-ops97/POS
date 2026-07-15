import { requireAuth, hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { listBudgetsWithProgress } from "@/lib/expenses/budget-service";
import { ensureDefaultExpenseCategories } from "@/lib/expenses/categories";
import { BudgetsClient } from "@/components/expenses/budgets-client";

export default async function BudgetsPage() {
  const ctx = await requireAuth();
  if (
    !hasPermission(ctx, PERMISSIONS.VIEW_EXPENSE_REPORTS) &&
    !hasPermission(ctx, PERMISSIONS.MANAGE_EXPENSE_BUDGETS)
  ) {
    redirect("/dashboard");
  }
  const [budgets, categories] = await Promise.all([
    listBudgetsWithProgress(ctx),
    ensureDefaultExpenseCategories(ctx.business.id),
  ]);
  return (
    <BudgetsClient
      budgets={budgets as never}
      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      canManage={hasPermission(ctx, PERMISSIONS.MANAGE_EXPENSE_BUDGETS)}
    />
  );
}
