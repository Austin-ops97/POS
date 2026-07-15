import Link from "next/link";
import { requireAuth, hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { listExpenses } from "@/lib/expenses/expense-service";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ExpenseStatusBadge } from "@/components/expenses/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ExpenseApprovalsPage() {
  const ctx = await requireAuth();
  if (!hasPermission(ctx, PERMISSIONS.APPROVE_EXPENSES)) {
    redirect("/finance/expenses");
  }

  const { items } = await listExpenses(ctx, {
    status: "PENDING_APPROVAL",
    pageSize: "50",
  });

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Finance</p>
        <h1 className="text-2xl font-bold text-slate-900">Pending approvals</h1>
        <p className="mt-1 text-sm text-slate-500">
          Review receipts inline — approve, reject, request changes, or flag.
        </p>
      </div>
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>{items.length} waiting</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.length === 0 ? (
            <p className="text-sm text-slate-500">You&apos;re all caught up.</p>
          ) : (
            items.map((item) => (
              <Link
                key={item.id}
                href={`/finance/expenses/${item.id}`}
                className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3 transition hover:bg-slate-50"
              >
                <div>
                  <p className="font-medium text-slate-900">{item.merchant}</p>
                  <p className="text-xs text-slate-500">
                    {item.employee.name} · {formatDate(item.purchaseDate)}
                    {item.missingReceipt ? " · Missing receipt" : ""}
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
    </div>
  );
}
