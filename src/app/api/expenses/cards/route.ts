import { NextResponse } from "next/server";
import { requireAuth, hasPermission } from "@/lib/auth";
import { handleApiError, getClientIp } from "@/lib/api-utils";
import { PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import { companyCardSchema } from "@/lib/validations/expenses";
import { logExpenseAudit } from "@/lib/expenses/audit";

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (
      !hasPermission(ctx, PERMISSIONS.VIEW_OWN_EXPENSES) &&
      !hasPermission(ctx, PERMISSIONS.MANAGE_EXPENSE_CARDS)
    ) {
      throw new Error(`Missing permission: ${PERMISSIONS.VIEW_OWN_EXPENSES}`);
    }
    const canManage = hasPermission(ctx, PERMISSIONS.MANAGE_EXPENSE_CARDS);
    const cards = await db.companyCard.findMany({
      where: {
        businessId: ctx.business.id,
        deletedAt: null,
        ...(canManage ? {} : { assignedEmployeeId: ctx.employee.id }),
      },
      include: {
        assignedEmployee: { select: { id: true, name: true } },
        allowedCategories: { include: { category: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(cards);
  } catch (error) {
    return handleApiError(error, "GET /api/expenses/cards");
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.MANAGE_EXPENSE_CARDS)) {
      throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_EXPENSE_CARDS}`);
    }
    const data = companyCardSchema.parse(await request.json());
    const card = await db.companyCard.create({
      data: {
        businessId: ctx.business.id,
        name: data.name,
        lastFour: data.lastFour,
        bank: data.bank,
        cardType: data.cardType ?? "CREDIT",
        assignedEmployeeId: data.assignedEmployeeId ?? null,
        monthlyLimit: data.monthlyLimit,
        dailyLimit: data.dailyLimit,
        status: data.status ?? "ACTIVE",
        notes: data.notes,
        createdById: ctx.employee.id,
        allowedCategories: data.allowedCategoryIds?.length
          ? {
              create: data.allowedCategoryIds.map((categoryId) => ({ categoryId })),
            }
          : undefined,
      },
      include: {
        assignedEmployee: { select: { id: true, name: true } },
        allowedCategories: { include: { category: { select: { id: true, name: true } } } },
      },
    });
    await logExpenseAudit({
      businessId: ctx.business.id,
      actorId: ctx.employee.id,
      action: "CARD_CREATE",
      entity: "CompanyCard",
      entityId: card.id,
      after: { name: card.name, lastFour: card.lastFour },
      ipAddress: getClientIp(request),
      systemAction: "COMPANY_CARD_CHANGE",
    });
    return NextResponse.json(card, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/expenses/cards");
  }
}
