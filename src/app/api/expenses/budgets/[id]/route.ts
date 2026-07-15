import { NextResponse } from "next/server";
import { requireAuth, hasPermission } from "@/lib/auth";
import { handleApiError, getClientIp } from "@/lib/api-utils";
import { PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import { logExpenseAudit } from "@/lib/expenses/audit";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.MANAGE_EXPENSE_BUDGETS)) {
      throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_EXPENSE_BUDGETS}`);
    }
    const { id } = await params;
    const budget = await db.expenseBudget.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await logExpenseAudit({
      businessId: ctx.business.id,
      actorId: ctx.employee.id,
      action: "BUDGET_DELETE",
      entity: "ExpenseBudget",
      entityId: id,
      after: budget,
      ipAddress: getClientIp(request),
      systemAction: "EXPENSE_BUDGET_CHANGE",
    });
    return NextResponse.json(budget);
  } catch (error) {
    return handleApiError(error, "DELETE /api/expenses/budgets/[id]");
  }
}
