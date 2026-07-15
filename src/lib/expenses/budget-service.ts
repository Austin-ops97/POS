import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/auth";
import { hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { expenseBudgetSchema } from "@/lib/validations/expenses";
import { notifyManagers } from "./notifications";
import { logExpenseAudit } from "./audit";
import { z } from "zod";

function periodWindow(budget: {
  period: "MONTHLY" | "QUARTERLY" | "ANNUAL";
  year: number;
  month?: number | null;
  quarter?: number | null;
}) {
  if (budget.period === "ANNUAL") {
    return {
      start: new Date(Date.UTC(budget.year, 0, 1)),
      end: new Date(Date.UTC(budget.year + 1, 0, 1)),
    };
  }
  if (budget.period === "QUARTERLY") {
    const q = budget.quarter ?? 1;
    const startMonth = (q - 1) * 3;
    return {
      start: new Date(Date.UTC(budget.year, startMonth, 1)),
      end: new Date(Date.UTC(budget.year, startMonth + 3, 1)),
    };
  }
  const month = (budget.month ?? 1) - 1;
  return {
    start: new Date(Date.UTC(budget.year, month, 1)),
    end: new Date(Date.UTC(budget.year, month + 1, 1)),
  };
}

export async function listBudgetsWithProgress(ctx: AuthContext) {
  const budgets = await db.expenseBudget.findMany({
    where: { businessId: ctx.business.id, deletedAt: null },
    include: { category: { select: { id: true, name: true } } },
    orderBy: [{ year: "desc" }, { period: "asc" }],
  });

  return Promise.all(
    budgets.map(async (budget) => {
      const { start, end } = periodWindow(budget);
      const spentAgg = await db.expense.aggregate({
        where: {
          businessId: ctx.business.id,
          deletedAt: null,
          categoryId: budget.categoryId,
          purchaseDate: { gte: start, lt: end },
          status: { notIn: ["REJECTED", "DRAFT", "ARCHIVED"] },
        },
        _sum: { total: true },
      });
      const spent = Number(spentAgg._sum.total ?? 0);
      const amount = Number(budget.amount);
      const pct = amount > 0 ? (spent / amount) * 100 : 0;
      return {
        ...budget,
        spent,
        percent: Number(pct.toFixed(1)),
        alertLevel:
          pct >= 100 ? 100 : pct >= 90 ? 90 : pct >= 75 ? 75 : 0,
      };
    })
  );
}

export async function upsertBudget(
  ctx: AuthContext,
  raw: z.infer<typeof expenseBudgetSchema>,
  ipAddress?: string
) {
  if (!hasPermission(ctx, PERMISSIONS.MANAGE_EXPENSE_BUDGETS)) {
    throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_EXPENSE_BUDGETS}`);
  }
  const data = expenseBudgetSchema.parse(raw);

  if (data.period === "MONTHLY" && !data.month) {
    throw new Error("Month is required for monthly budgets");
  }
  if (data.period === "QUARTERLY" && !data.quarter) {
    throw new Error("Quarter is required for quarterly budgets");
  }

  const existing = await db.expenseBudget.findFirst({
    where: {
      businessId: ctx.business.id,
      categoryId: data.categoryId,
      period: data.period,
      year: data.year,
      month: data.month ?? null,
      quarter: data.quarter ?? null,
    },
  });

  const budget = existing
    ? await db.expenseBudget.update({
        where: { id: existing.id },
        data: {
          amount: data.amount,
          alert75: data.alert75,
          alert90: data.alert90,
          alert100: data.alert100,
          deletedAt: null,
        },
        include: { category: true },
      })
    : await db.expenseBudget.create({
        data: {
          businessId: ctx.business.id,
          categoryId: data.categoryId,
          period: data.period,
          amount: data.amount,
          year: data.year,
          month: data.month ?? null,
          quarter: data.quarter ?? null,
          alert75: data.alert75 ?? true,
          alert90: data.alert90 ?? true,
          alert100: data.alert100 ?? true,
        },
        include: { category: true },
      });

  await logExpenseAudit({
    businessId: ctx.business.id,
    actorId: ctx.employee.id,
    action: "BUDGET_UPSERT",
    entity: "ExpenseBudget",
    entityId: budget.id,
    after: budget,
    ipAddress,
    systemAction: "EXPENSE_BUDGET_CHANGE",
  });

  return budget;
}

export async function checkBudgetAlerts(businessId: string, categoryId: string | null) {
  if (!categoryId) return;
  const year = new Date().getUTCFullYear();
  const month = new Date().getUTCMonth() + 1;
  const quarter = Math.ceil(month / 3);

  const budgets = await db.expenseBudget.findMany({
    where: {
      businessId,
      categoryId,
      deletedAt: null,
      year,
      OR: [
        { period: "ANNUAL" },
        { period: "MONTHLY", month },
        { period: "QUARTERLY", quarter },
      ],
    },
    include: { category: true },
  });

  for (const budget of budgets) {
    const { start, end } = periodWindow(budget);
    const spentAgg = await db.expense.aggregate({
      where: {
        businessId,
        deletedAt: null,
        categoryId,
        purchaseDate: { gte: start, lt: end },
        status: { notIn: ["REJECTED", "DRAFT", "ARCHIVED"] },
      },
      _sum: { total: true },
    });
    const spent = Number(spentAgg._sum.total ?? 0);
    const amount = Number(budget.amount);
    if (amount <= 0) continue;
    const pct = (spent / amount) * 100;
    const threshold =
      pct >= 100 && budget.alert100
        ? 100
        : pct >= 90 && budget.alert90
          ? 90
          : pct >= 75 && budget.alert75
            ? 75
            : null;
    if (!threshold) continue;
    await notifyManagers({
      businessId,
      type: "BUDGET_EXCEEDED",
      title: `Budget ${threshold}% — ${budget.category.name}`,
      body: `${budget.category.name} is at ${pct.toFixed(0)}% of its ${budget.period.toLowerCase()} budget ($${spent.toFixed(2)} / $${amount.toFixed(2)}).`,
    });
  }
}
