import Link from "next/link";
import { Suspense } from "react";
import { requireAuth, hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { getExpenseDashboard } from "@/lib/expenses/dashboard-service";
import { listExpenses, ensureExpenseModuleReady } from "@/lib/expenses/expense-service";
import { ensureDefaultExpenseCategories } from "@/lib/expenses/categories";
import { ExpenseDashboard } from "@/components/expenses/expense-dashboard";
import { ExpenseList } from "@/components/expenses/expense-list";
import { Button } from "@/components/ui/button";
import { redirect } from "next/navigation";

export default async function FinanceExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireAuth();
  if (
    !hasPermission(ctx, PERMISSIONS.VIEW_OWN_EXPENSES) &&
    !hasPermission(ctx, PERMISSIONS.VIEW_TEAM_EXPENSES)
  ) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const view = typeof params.view === "string" ? params.view : "dashboard";
  await ensureExpenseModuleReady(ctx.business.id);

  if (view === "list") {
    const query: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string") query[key] = value;
    }
    const [{ items }, categories] = await Promise.all([
      listExpenses(ctx, query),
      ensureDefaultExpenseCategories(ctx.business.id),
    ]);
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
              Finance
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">All expenses</h1>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" className="rounded-xl">
              <Link href="/finance/expenses">Dashboard</Link>
            </Button>
            <Button asChild className="rounded-xl">
              <Link href="/finance/expenses/new">New Expense</Link>
            </Button>
          </div>
        </div>
        <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-slate-100" />}>
          <ExpenseList
            items={items as never}
            categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          />
        </Suspense>
      </div>
    );
  }

  const data = await getExpenseDashboard(ctx);
  return <ExpenseDashboard data={data as never} />;
}
