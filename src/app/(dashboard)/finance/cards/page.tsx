import { requireAuth, hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { CompanyCardsClient } from "@/components/expenses/company-cards-client";

export default async function CompanyCardsPage() {
  const ctx = await requireAuth();
  if (
    !hasPermission(ctx, PERMISSIONS.VIEW_OWN_EXPENSES) &&
    !hasPermission(ctx, PERMISSIONS.MANAGE_EXPENSE_CARDS)
  ) {
    redirect("/dashboard");
  }

  const canManage = hasPermission(ctx, PERMISSIONS.MANAGE_EXPENSE_CARDS);
  const [cards, employees] = await Promise.all([
    db.companyCard.findMany({
      where: {
        businessId: ctx.business.id,
        deletedAt: null,
        ...(canManage ? {} : { assignedEmployeeId: ctx.employee.id }),
      },
      include: { assignedEmployee: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.employeeProfile.findMany({
      where: { businessId: ctx.business.id, status: "ACTIVE", deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <CompanyCardsClient
      cards={cards as never}
      employees={employees}
      canManage={canManage}
    />
  );
}
