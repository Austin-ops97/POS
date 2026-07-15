import Link from "next/link";
import { requireAuth, hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { listExpenses } from "@/lib/expenses/expense-service";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ExpenseStatusBadge } from "@/components/expenses/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ReimbursementsPage() {
  const ctx = await requireAuth();
  if (
    !hasPermission(ctx, PERMISSIONS.VIEW_OWN_EXPENSES) &&
    !hasPermission(ctx, PERMISSIONS.REIMBURSE_EXPENSES)
  ) {
    redirect("/dashboard");
  }

  const [owed, reimbursed] = await Promise.all([
    listExpenses(ctx, { status: "APPROVED", pageSize: "50" }),
    listExpenses(ctx, { status: "REIMBURSED", pageSize: "50" }),
  ]);

  const personalOwed = owed.items.filter((e) =>
    ["PERSONAL_CARD", "CASH", "BANK_TRANSFER"].includes(e.paymentMethod)
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Finance</p>
        <h1 className="text-2xl font-bold text-slate-900">Reimbursements</h1>
        <p className="mt-1 text-sm text-slate-500">
          Approved out-of-pocket spend waiting to be reimbursed, plus recent payouts.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Upcoming reimbursements</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {personalOwed.length === 0 ? (
              <p className="text-sm text-slate-500">Nothing owed right now.</p>
            ) : (
              personalOwed.map((item) => (
                <Link
                  key={item.id}
                  href={`/finance/expenses/${item.id}`}
                  className="flex justify-between rounded-xl border border-slate-100 px-3 py-3 hover:bg-slate-50"
                >
                  <div>
                    <p className="font-medium">{item.merchant}</p>
                    <p className="text-xs text-slate-500">
                      {item.employee.name} · {formatDate(item.purchaseDate)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{formatCurrency(Number(item.total))}</p>
                    <ExpenseStatusBadge status={item.status} />
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Recently reimbursed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {reimbursed.items.length === 0 ? (
              <p className="text-sm text-slate-500">No reimbursements recorded yet.</p>
            ) : (
              reimbursed.items.map((item) => (
                <Link
                  key={item.id}
                  href={`/finance/expenses/${item.id}`}
                  className="flex justify-between rounded-xl border border-slate-100 px-3 py-3 hover:bg-slate-50"
                >
                  <div>
                    <p className="font-medium">{item.merchant}</p>
                    <p className="text-xs text-slate-500">
                      {item.employee.name} · {formatDate(item.purchaseDate)}
                    </p>
                  </div>
                  <p className="font-semibold">{formatCurrency(Number(item.total))}</p>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
