import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/auth";
import { canViewAllExpenses, ensureExpenseModuleReady } from "./expense-service";
import type { Prisma } from "@prisma/client";

function monthBounds(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

export async function getExpenseDashboard(ctx: AuthContext) {
  await ensureExpenseModuleReady(ctx.business.id);
  const viewAll = canViewAllExpenses(ctx);
  const scope: Prisma.ExpenseWhereInput = {
    businessId: ctx.business.id,
    deletedAt: null,
    ...(viewAll ? {} : { employeeId: ctx.employee.id }),
  };

  const { start, end } = monthBounds();

  const [
    pendingApproval,
    approved,
    reimbursed,
    flagged,
    missingReceipts,
    monthAgg,
    cards,
    reimbursementsOwed,
    recent,
    byCategory,
    byEmployee,
    byLocation,
    byDepartment,
    vendors,
  ] = await Promise.all([
    db.expense.count({
      where: { ...scope, status: { in: ["SUBMITTED", "PENDING_APPROVAL"] } },
    }),
    db.expense.count({ where: { ...scope, status: "APPROVED" } }),
    db.expense.count({ where: { ...scope, status: "REIMBURSED" } }),
    db.expense.count({
      where: { ...scope, flags: { some: { resolved: false } } },
    }),
    db.expense.count({ where: { ...scope, missingReceipt: true } }),
    db.expense.aggregate({
      where: {
        ...scope,
        purchaseDate: { gte: start, lt: end },
        status: { notIn: ["REJECTED", "DRAFT", "ARCHIVED"] },
      },
      _sum: { total: true },
    }),
    db.companyCard.findMany({
      where: { businessId: ctx.business.id, deletedAt: null, status: "ACTIVE" },
      select: { id: true, name: true, lastFour: true, monthlyLimit: true },
    }),
    db.expense.aggregate({
      where: {
        ...scope,
        status: "APPROVED",
        paymentMethod: { in: ["PERSONAL_CARD", "CASH", "BANK_TRANSFER"] },
      },
      _sum: { total: true },
    }),
    db.expense.findMany({
      where: scope,
      include: {
        employee: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        flags: { where: { resolved: false }, take: 3 },
      },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    db.expense.groupBy({
      by: ["categoryId"],
      where: {
        ...scope,
        purchaseDate: { gte: start, lt: end },
        status: { notIn: ["REJECTED", "DRAFT", "ARCHIVED"] },
      },
      _sum: { total: true },
      _count: true,
    }),
    db.expense.groupBy({
      by: ["employeeId"],
      where: {
        ...scope,
        purchaseDate: { gte: start, lt: end },
        status: { notIn: ["REJECTED", "DRAFT", "ARCHIVED"] },
      },
      _sum: { total: true },
      _count: true,
    }),
    db.expense.groupBy({
      by: ["locationId"],
      where: {
        ...scope,
        purchaseDate: { gte: start, lt: end },
        status: { notIn: ["REJECTED", "DRAFT", "ARCHIVED"] },
      },
      _sum: { total: true },
      _count: true,
    }),
    db.expense.groupBy({
      by: ["department"],
      where: {
        ...scope,
        purchaseDate: { gte: start, lt: end },
        status: { notIn: ["REJECTED", "DRAFT", "ARCHIVED"] },
        department: { not: null },
      },
      _sum: { total: true },
      _count: true,
    }),
    db.expenseVendor.findMany({
      where: { businessId: ctx.business.id, deletedAt: null },
      orderBy: { totalSpend: "desc" },
      take: 8,
    }),
  ]);

  // Monthly spend trend (last 6 months)
  const months: Array<{ label: string; total: number }> = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() - i, 1);
    const mStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    const mEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    const agg = await db.expense.aggregate({
      where: {
        ...scope,
        purchaseDate: { gte: mStart, lt: mEnd },
        status: { notIn: ["REJECTED", "DRAFT", "ARCHIVED"] },
      },
      _sum: { total: true },
    });
    months.push({
      label: mStart.toLocaleString("en-US", { month: "short", timeZone: "UTC" }),
      total: Number(agg._sum.total ?? 0),
    });
  }

  const categoryIds = byCategory.map((c) => c.categoryId).filter(Boolean) as string[];
  const employeeIds = byEmployee.map((e) => e.employeeId);
  const locationIds = byLocation.map((l) => l.locationId).filter(Boolean) as string[];

  const [categories, employees, locations, budgets, cardSpend] = await Promise.all([
    categoryIds.length
      ? db.expenseCategory.findMany({
          where: { id: { in: categoryIds } },
          select: { id: true, name: true },
        })
      : [],
    employeeIds.length
      ? db.employeeProfile.findMany({
          where: { id: { in: employeeIds } },
          select: { id: true, name: true },
        })
      : [],
    locationIds.length
      ? db.location.findMany({
          where: { id: { in: locationIds } },
          select: { id: true, name: true },
        })
      : [],
    db.expenseBudget.findMany({
      where: { businessId: ctx.business.id, deletedAt: null, year: start.getUTCFullYear() },
      include: { category: { select: { id: true, name: true } } },
      take: 12,
    }),
    Promise.all(
      cards.map(async (card) => {
        const spent = await db.expense.aggregate({
          where: {
            businessId: ctx.business.id,
            deletedAt: null,
            companyCardId: card.id,
            purchaseDate: { gte: start, lt: end },
            status: { notIn: ["REJECTED", "DRAFT", "ARCHIVED"] },
          },
          _sum: { total: true },
        });
        return {
          ...card,
          spent: Number(spent._sum.total ?? 0),
          limit: card.monthlyLimit != null ? Number(card.monthlyLimit) : null,
        };
      })
    ),
  ]);

  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));
  const employeeMap = new Map(employees.map((e) => [e.id, e.name]));
  const locationMap = new Map(locations.map((l) => [l.id, l.name]));

  const companyCardBalance = cardSpend.reduce((sum, c) => {
    if (c.limit == null) return sum;
    return sum + Math.max(0, c.limit - c.spent);
  }, 0);

  return {
    cards: {
      pendingApproval,
      approved,
      reimbursed,
      flagged,
      missingReceipts,
      thisMonthSpend: Number(monthAgg._sum.total ?? 0),
      companyCardBalance,
      reimbursementsOwed: Number(reimbursementsOwed._sum.total ?? 0),
    },
    charts: {
      monthlySpend: months,
      byCategory: byCategory.map((row) => ({
        name: row.categoryId ? categoryMap.get(row.categoryId) ?? "Uncategorized" : "Uncategorized",
        total: Number(row._sum.total ?? 0),
        count: row._count,
      })),
      byEmployee: byEmployee.map((row) => ({
        name: employeeMap.get(row.employeeId) ?? "Unknown",
        total: Number(row._sum.total ?? 0),
        count: row._count,
      })),
      byLocation: byLocation.map((row) => ({
        name: row.locationId ? locationMap.get(row.locationId) ?? "Unassigned" : "Unassigned",
        total: Number(row._sum.total ?? 0),
        count: row._count,
      })),
      byDepartment: byDepartment.map((row) => ({
        name: row.department || "Unassigned",
        total: Number(row._sum.total ?? 0),
        count: row._count,
      })),
      largestVendors: vendors.map((v) => ({
        id: v.id,
        name: v.name,
        total: Number(v.totalSpend),
        average: Number(v.averageSpend),
        count: v.purchaseCount,
        favorite: v.isFavorite,
      })),
    },
    recentActivity: recent,
    cardUtilization: cardSpend,
    budgets: budgets.map((b) => ({
      id: b.id,
      category: b.category.name,
      period: b.period,
      amount: Number(b.amount),
      year: b.year,
      month: b.month,
      quarter: b.quarter,
    })),
  };
}
