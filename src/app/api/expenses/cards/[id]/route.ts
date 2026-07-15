import { NextResponse } from "next/server";
import { requireAuth, hasPermission } from "@/lib/auth";
import { handleApiError, getClientIp } from "@/lib/api-utils";
import { PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import { companyCardSchema } from "@/lib/validations/expenses";
import { logExpenseAudit } from "@/lib/expenses/audit";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const card = await db.companyCard.findFirst({
      where: { id, businessId: ctx.business.id, deletedAt: null },
      include: {
        assignedEmployee: { select: { id: true, name: true } },
        allowedCategories: { include: { category: { select: { id: true, name: true } } } },
        transactions: { orderBy: { purchasedAt: "desc" }, take: 50 },
        expenses: {
          where: { deletedAt: null },
          orderBy: { purchaseDate: "desc" },
          take: 20,
          include: { employee: { select: { id: true, name: true } } },
        },
      },
    });
    if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(card);
  } catch (error) {
    return handleApiError(error, "GET /api/expenses/cards/[id]");
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.MANAGE_EXPENSE_CARDS)) {
      throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_EXPENSE_CARDS}`);
    }
    const { id } = await params;
    const data = companyCardSchema.partial().parse(await request.json());
    const existing = await db.companyCard.findFirst({
      where: { id, businessId: ctx.business.id, deletedAt: null },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (data.allowedCategoryIds) {
      await db.companyCardAllowedCategory.deleteMany({ where: { cardId: id } });
      if (data.allowedCategoryIds.length) {
        await db.companyCardAllowedCategory.createMany({
          data: data.allowedCategoryIds.map((categoryId) => ({ cardId: id, categoryId })),
        });
      }
    }

    const card = await db.companyCard.update({
      where: { id },
      data: {
        name: data.name,
        lastFour: data.lastFour,
        bank: data.bank === undefined ? undefined : data.bank,
        cardType: data.cardType,
        assignedEmployeeId:
          data.assignedEmployeeId === undefined ? undefined : data.assignedEmployeeId,
        monthlyLimit: data.monthlyLimit === undefined ? undefined : data.monthlyLimit,
        dailyLimit: data.dailyLimit === undefined ? undefined : data.dailyLimit,
        status: data.status,
        notes: data.notes === undefined ? undefined : data.notes,
      },
      include: {
        assignedEmployee: { select: { id: true, name: true } },
        allowedCategories: { include: { category: { select: { id: true, name: true } } } },
      },
    });

    await logExpenseAudit({
      businessId: ctx.business.id,
      actorId: ctx.employee.id,
      action: "CARD_UPDATE",
      entity: "CompanyCard",
      entityId: id,
      before: existing,
      after: card,
      ipAddress: getClientIp(request),
      systemAction: "COMPANY_CARD_CHANGE",
    });
    return NextResponse.json(card);
  } catch (error) {
    return handleApiError(error, "PATCH /api/expenses/cards/[id]");
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.MANAGE_EXPENSE_CARDS)) {
      throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_EXPENSE_CARDS}`);
    }
    const { id } = await params;
    const card = await db.companyCard.update({
      where: { id },
      data: { deletedAt: new Date(), status: "CANCELLED" },
    });
    await logExpenseAudit({
      businessId: ctx.business.id,
      actorId: ctx.employee.id,
      action: "CARD_DELETE",
      entity: "CompanyCard",
      entityId: id,
      after: card,
      ipAddress: getClientIp(request),
      systemAction: "COMPANY_CARD_CHANGE",
    });
    return NextResponse.json(card);
  } catch (error) {
    return handleApiError(error, "DELETE /api/expenses/cards/[id]");
  }
}
