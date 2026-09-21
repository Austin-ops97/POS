import { redirect } from "next/navigation";
import { requireAuth, hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import { canViewAllExpenses, ensureExpenseModuleReady } from "@/lib/expenses/expense-service";
import { ensureDefaultExpenseCategories } from "@/lib/expenses/categories";
import { ReceiptLibrary } from "@/components/expenses/receipt-library";

export const metadata = { title: "Receipts" };

export default async function ReceiptLibraryPage() {
  const ctx = await requireAuth();
  if (
    !hasPermission(ctx, PERMISSIONS.VIEW_OWN_EXPENSES) &&
    !hasPermission(ctx, PERMISSIONS.VIEW_TEAM_EXPENSES) &&
    !hasPermission(ctx, PERMISSIONS.VIEW_EXPENSE_REPORTS)
  ) {
    redirect("/dashboard");
  }
  await ensureExpenseModuleReady(ctx.business.id);
  const viewAll = canViewAllExpenses(ctx);
  const [categories, employees, cards, locations] = await Promise.all([
    ensureDefaultExpenseCategories(ctx.business.id),
    viewAll
      ? db.employeeProfile.findMany({
          where: { businessId: ctx.business.id, deletedAt: null, status: "ACTIVE" },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    db.companyCard.findMany({
      where: { businessId: ctx.business.id, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.location.findMany({
      where: { businessId: ctx.business.id, deletedAt: null, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <ReceiptLibrary
      categories={categories.map((category) => ({ id: category.id, name: category.name }))}
      employees={employees}
      cards={cards}
      locations={locations}
      canChooseEmployee={viewAll}
    />
  );
}
