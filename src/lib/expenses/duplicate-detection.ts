import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export type DuplicateWarning = {
  type: "DUPLICATE";
  severity: "WARNING";
  message: string;
  matchedExpenseId: string;
  reasons: string[];
};

type Candidate = {
  merchant: string;
  total: number;
  purchaseDate: Date | string;
  contentHash?: string | null;
  receiptHashes?: string[];
  excludeExpenseId?: string;
};

function sameDay(a: Date | string, b: Date | string): boolean {
  const da = new Date(a);
  const dbDate = new Date(b);
  return (
    da.getUTCFullYear() === dbDate.getUTCFullYear() &&
    da.getUTCMonth() === dbDate.getUTCMonth() &&
    da.getUTCDate() === dbDate.getUTCDate()
  );
}

function moneyClose(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.009;
}

export async function findPossibleDuplicates(
  businessId: string,
  candidate: Candidate
): Promise<DuplicateWarning[]> {
  const day = new Date(candidate.purchaseDate);
  const start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  const where: Prisma.ExpenseWhereInput = {
    businessId,
    deletedAt: null,
    ...(candidate.excludeExpenseId ? { id: { not: candidate.excludeExpenseId } } : {}),
    OR: [
      {
        purchaseDate: { gte: start, lt: end },
        merchant: { equals: candidate.merchant, mode: "insensitive" },
        total: candidate.total,
      },
      ...(candidate.contentHash
        ? [{ contentHash: candidate.contentHash }]
        : []),
      ...(candidate.receiptHashes?.length
        ? [
            {
              receipts: {
                some: {
                  deletedAt: null,
                  contentHash: { in: candidate.receiptHashes },
                },
              },
            },
          ]
        : []),
    ],
  };

  const matches = await db.expense.findMany({
    where,
    select: {
      id: true,
      merchant: true,
      total: true,
      purchaseDate: true,
      contentHash: true,
      receipts: {
        where: { deletedAt: null },
        select: { contentHash: true },
      },
    },
    take: 10,
  });

  const warnings: DuplicateWarning[] = [];
  for (const match of matches) {
    const reasons: string[] = [];
    if (
      match.merchant.toLowerCase() === candidate.merchant.toLowerCase() &&
      moneyClose(Number(match.total), candidate.total) &&
      sameDay(match.purchaseDate, candidate.purchaseDate)
    ) {
      reasons.push("Same merchant, amount, and day");
    }
    if (candidate.contentHash && match.contentHash === candidate.contentHash) {
      reasons.push("Matching expense content hash");
    }
    const receiptOverlap = match.receipts.some(
      (r) => r.contentHash && candidate.receiptHashes?.includes(r.contentHash)
    );
    if (receiptOverlap) reasons.push("Same receipt image");

    if (reasons.length === 0) continue;
    warnings.push({
      type: "DUPLICATE",
      severity: "WARNING",
      message: `Possible duplicate of expense ${match.id.slice(0, 8)}…`,
      matchedExpenseId: match.id,
      reasons,
    });
  }

  return warnings;
}
