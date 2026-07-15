import { NextResponse } from "next/server";
import { requireAuth, hasPermission } from "@/lib/auth";
import { handleApiError, getClientIp } from "@/lib/api-utils";
import { PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import { expenseCategorySchema } from "@/lib/validations/expenses";
import { ensureDefaultExpenseCategories } from "@/lib/expenses/categories";
import { slugifyCategory } from "@/lib/expenses/constants";
import { logExpenseAudit } from "@/lib/expenses/audit";

export async function GET() {
  try {
    const ctx = await requireAuth();
    const categories = await ensureDefaultExpenseCategories(ctx.business.id);
    return NextResponse.json(categories);
  } catch (error) {
    return handleApiError(error, "GET /api/expenses/categories");
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.MANAGE_EXPENSE_CATEGORIES)) {
      throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_EXPENSE_CATEGORIES}`);
    }
    const data = expenseCategorySchema.parse(await request.json());
    const category = await db.expenseCategory.create({
      data: {
        businessId: ctx.business.id,
        name: data.name,
        slug: slugifyCategory(data.name),
        description: data.description,
        isActive: data.isActive ?? true,
        sortOrder: data.sortOrder ?? 999,
      },
    });
    await logExpenseAudit({
      businessId: ctx.business.id,
      actorId: ctx.employee.id,
      action: "CATEGORY_CREATE",
      entity: "ExpenseCategory",
      entityId: category.id,
      after: category,
      ipAddress: getClientIp(request),
      systemAction: "EXPENSE_CATEGORY_CHANGE",
    });
    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/expenses/categories");
  }
}
