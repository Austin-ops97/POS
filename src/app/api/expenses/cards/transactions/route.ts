import { NextResponse } from "next/server";
import { requireAuth, hasPermission } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import { cardTransactionSchema } from "@/lib/validations/expenses";
import { ingestExternalTransactions } from "@/lib/expenses/card-sync";

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    if (
      !hasPermission(ctx, PERMISSIONS.MANAGE_EXPENSE_CARDS) &&
      !hasPermission(ctx, PERMISSIONS.VIEW_TEAM_EXPENSES)
    ) {
      throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_EXPENSE_CARDS}`);
    }
    const { searchParams } = new URL(request.url);
    const companyCardId = searchParams.get("companyCardId") ?? undefined;
    const txs = await db.companyCardTransaction.findMany({
      where: {
        businessId: ctx.business.id,
        deletedAt: null,
        ...(companyCardId ? { companyCardId } : {}),
      },
      include: {
        companyCard: { select: { id: true, name: true, lastFour: true } },
        employee: { select: { id: true, name: true } },
      },
      orderBy: { purchasedAt: "desc" },
      take: 100,
    });
    return NextResponse.json(txs);
  } catch (error) {
    return handleApiError(error, "GET /api/expenses/cards/transactions");
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.MANAGE_EXPENSE_CARDS)) {
      throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_EXPENSE_CARDS}`);
    }
    const data = cardTransactionSchema.parse(await request.json());
    const purchasedAt =
      data.purchasedAt.length === 10
        ? new Date(`${data.purchasedAt}T12:00:00.000Z`)
        : new Date(data.purchasedAt);

    const [row] = await ingestExternalTransactions({
      businessId: ctx.business.id,
      source: data.source ?? "MANUAL",
      companyCardId: data.companyCardId,
      employeeId: data.employeeId,
      transactions: [
        {
          externalId: data.externalId ?? `manual-${crypto.randomUUID()}`,
          merchantName: data.merchantName,
          amount: data.amount,
          currency: data.currency,
          purchasedAt,
          rawPayload: data.rawPayload,
        },
      ],
    });
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/expenses/cards/transactions");
  }
}
