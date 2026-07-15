import { NextResponse } from "next/server";
import { requireAuth, hasPermission } from "@/lib/auth";
import { handleApiError, getClientIp } from "@/lib/api-utils";
import { PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import { expenseCategorySchema } from "@/lib/validations/expenses";
import { slugifyCategory } from "@/lib/expenses/constants";
import { logExpenseAudit } from "@/lib/expenses/audit";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.MANAGE_EXPENSE_CATEGORIES)) {
      throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_EXPENSE_CATEGORIES}`);
    }
    const { id } = await params;
    const data = expenseCategorySchema.partial().parse(await request.json());
    const existing = await db.expenseCategory.findFirst({
      where: { id, businessId: ctx.business.id, deletedAt: null },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const category = await db.expenseCategory.update({
      where: { id },
      data: {
        name: data.name,
        slug: data.name ? slugifyCategory(data.name) : undefined,
        description: data.description,
        isActive: data.isActive,
        sortOrder: data.sortOrder,
      },
    });
    await logExpenseAudit({
      businessId: ctx.business.id,
      actorId: ctx.employee.id,
      action: "CATEGORY_UPDATE",
      entity: "ExpenseCategory",
      entityId: id,
      before: existing,
      after: category,
      ipAddress: getClientIp(request),
      systemAction: "EXPENSE_CATEGORY_CHANGE",
    });
    return NextResponse.json(category);
  } catch (error) {
    return handleApiError(error, "PATCH /api/expenses/categories/[id]");
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.MANAGE_EXPENSE_CATEGORIES)) {
      throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_EXPENSE_CATEGORIES}`);
    }
    const { id } = await params;
    const existing = await db.expenseCategory.findFirst({
      where: { id, businessId: ctx.business.id, deletedAt: null },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (existing.isSystem) {
      return NextResponse.json(
        { error: "System categories cannot be deleted", code: "SYSTEM_CATEGORY" },
        { status: 400 }
      );
    }
    const category = await db.expenseCategory.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await logExpenseAudit({
      businessId: ctx.business.id,
      actorId: ctx.employee.id,
      action: "CATEGORY_DELETE",
      entity: "ExpenseCategory",
      entityId: id,
      before: existing,
      after: category,
      ipAddress: getClientIp(request),
      systemAction: "EXPENSE_CATEGORY_CHANGE",
    });
    return NextResponse.json(category);
  } catch (error) {
    return handleApiError(error, "DELETE /api/expenses/categories/[id]");
  }
}
