import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAuth, hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function CompanyCardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireAuth();
  if (
    !hasPermission(ctx, PERMISSIONS.VIEW_OWN_EXPENSES) &&
    !hasPermission(ctx, PERMISSIONS.MANAGE_EXPENSE_CARDS)
  ) {
    redirect("/dashboard");
  }
  const { id } = await params;
  const card = await db.companyCard.findFirst({
    where: { id, businessId: ctx.business.id, deletedAt: null },
    include: {
      assignedEmployee: { select: { id: true, name: true } },
      allowedCategories: { include: { category: true } },
      transactions: { orderBy: { purchasedAt: "desc" }, take: 40 },
      expenses: {
        where: { deletedAt: null },
        orderBy: { purchaseDate: "desc" },
        take: 40,
        include: { employee: { select: { name: true } } },
      },
    },
  });
  if (!card) notFound();

  return (
    <div className="space-y-4">
      <Button asChild variant="outline" className="rounded-xl">
        <Link href="/finance/cards">Back to cards</Link>
      </Button>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {card.name} ····{card.lastFour}
        </h1>
        <p className="text-sm text-slate-500">
          {card.bank || "Bank unset"} · {card.cardType} · {card.status}
          {card.assignedEmployee ? ` · ${card.assignedEmployee.name}` : ""}
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Recent expenses</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {card.expenses.length === 0 ? (
              <p className="text-sm text-slate-500">No expenses on this card yet.</p>
            ) : (
              card.expenses.map((expense) => (
                <Link
                  key={expense.id}
                  href={`/finance/expenses/${expense.id}`}
                  className="flex justify-between rounded-xl border border-slate-100 px-3 py-2 text-sm hover:bg-slate-50"
                >
                  <span>
                    {expense.merchant}
                    <span className="block text-xs text-slate-500">
                      {expense.employee.name} · {formatDate(expense.purchaseDate)}
                    </span>
                  </span>
                  <span className="font-medium">{formatCurrency(Number(expense.total))}</span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Card feed transactions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-slate-500">
              Manual today — ready for Stripe, Amex, Chase, Capital One, Brex, Ramp, or Plaid sync.
            </p>
            {card.transactions.length === 0 ? (
              <p className="text-sm text-slate-500">No synced transactions yet.</p>
            ) : (
              card.transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex justify-between rounded-xl border border-slate-100 px-3 py-2 text-sm"
                >
                  <span>
                    {tx.merchantName}
                    <span className="block text-xs text-slate-500">
                      {tx.source} · {formatDate(tx.purchasedAt)}
                    </span>
                  </span>
                  <span className="font-medium">{formatCurrency(Number(tx.amount))}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
