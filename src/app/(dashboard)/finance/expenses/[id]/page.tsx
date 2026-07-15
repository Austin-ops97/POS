import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAuth, hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { getExpenseById } from "@/lib/expenses/expense-service";
import { ApprovalPanel } from "@/components/expenses/approval-panel";
import { Button } from "@/components/ui/button";

export default async function ExpenseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireAuth();
  if (
    !hasPermission(ctx, PERMISSIONS.VIEW_OWN_EXPENSES) &&
    !hasPermission(ctx, PERMISSIONS.VIEW_TEAM_EXPENSES)
  ) {
    redirect("/dashboard");
  }
  const { id } = await params;
  const expense = await getExpenseById(ctx, id);
  if (!expense) notFound();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button asChild variant="outline" className="rounded-xl">
          <Link href="/finance/expenses?view=list">Back to list</Link>
        </Button>
        {["DRAFT", "NEEDS_MORE_INFO", "REJECTED"].includes(expense.status) &&
        expense.employeeId === ctx.employee.id ? (
          <Button asChild variant="outline" className="rounded-xl">
            <Link href={`/finance/expenses/new?edit=${expense.id}`}>Edit as new draft values</Link>
          </Button>
        ) : null}
      </div>
      <ApprovalPanel
        expense={expense as never}
        canApprove={hasPermission(ctx, PERMISSIONS.APPROVE_EXPENSES)}
        canReimburse={hasPermission(ctx, PERMISSIONS.REIMBURSE_EXPENSES)}
      />
    </div>
  );
}
