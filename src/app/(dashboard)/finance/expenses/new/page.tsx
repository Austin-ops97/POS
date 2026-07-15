import { requireAuth, hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { ensureExpenseModuleReady } from "@/lib/expenses/expense-service";
import { ensureDefaultExpenseCategories } from "@/lib/expenses/categories";
import { ExpenseForm } from "@/components/expenses/expense-form";

export default async function NewExpensePage() {
  const ctx = await requireAuth();
  if (!hasPermission(ctx, PERMISSIONS.CREATE_EXPENSE)) {
    redirect("/finance/expenses");
  }
  await ensureExpenseModuleReady(ctx.business.id);

  const [categories, cards, employees, locations, vendors] = await Promise.all([
    ensureDefaultExpenseCategories(ctx.business.id),
    db.companyCard.findMany({
      where: { businessId: ctx.business.id, deletedAt: null, status: "ACTIVE" },
      select: { id: true, name: true, lastFour: true },
      orderBy: { name: "asc" },
    }),
    db.employeeProfile.findMany({
      where: { businessId: ctx.business.id, status: "ACTIVE", deletedAt: null },
      select: { id: true, name: true, department: true },
      orderBy: { name: "asc" },
    }),
    db.location.findMany({
      where: { businessId: ctx.business.id, isActive: true, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.expenseVendor.findMany({
      where: { businessId: ctx.business.id, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { totalSpend: "desc" },
      take: 40,
    }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Finance</p>
        <h1 className="text-2xl font-bold text-slate-900">New expense</h1>
        <p className="mt-1 text-sm text-slate-500">
          Scan a receipt or enter a few fields — autocomplete handles the rest.
        </p>
      </div>
      <ExpenseForm
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        cards={cards}
        employees={employees}
        locations={locations}
        vendors={vendors}
        defaultEmployeeId={ctx.employee.id}
        defaultLocationId={ctx.location?.id}
        defaultDepartment={ctx.employee.department}
        canAssignEmployee={hasPermission(ctx, PERMISSIONS.VIEW_TEAM_EXPENSES)}
      />
    </div>
  );
}
