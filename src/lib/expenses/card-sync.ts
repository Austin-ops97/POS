import type { CardTransactionSource, Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Abstraction for corporate card / bank feeds.
 * Today: MANUAL entry. Later: Stripe, Amex, Chase, Capital One, Brex, Ramp, Plaid.
 */
export type ExternalCardTransaction = {
  externalId: string;
  merchantName: string;
  amount: number;
  currency?: string;
  purchasedAt: Date;
  companyCardLastFour?: string;
  rawPayload?: Record<string, unknown>;
};

export interface CardFeedProvider {
  source: CardTransactionSource;
  fetchTransactions(params: {
    businessId: string;
    since?: Date;
  }): Promise<ExternalCardTransaction[]>;
}

export class ManualCardFeedProvider implements CardFeedProvider {
  source: CardTransactionSource = "MANUAL";

  async fetchTransactions(): Promise<ExternalCardTransaction[]> {
    return [];
  }
}

const providers: Partial<Record<CardTransactionSource, CardFeedProvider>> = {
  MANUAL: new ManualCardFeedProvider(),
};

export function registerCardFeedProvider(provider: CardFeedProvider) {
  providers[provider.source] = provider;
}

export function getCardFeedProvider(source: CardTransactionSource): CardFeedProvider {
  return providers[source] ?? new ManualCardFeedProvider();
}

export async function ingestExternalTransactions(params: {
  businessId: string;
  source: CardTransactionSource;
  companyCardId?: string | null;
  employeeId?: string | null;
  transactions: ExternalCardTransaction[];
}) {
  const results = [];
  for (const tx of params.transactions) {
    const data: Prisma.CompanyCardTransactionCreateInput = {
      business: { connect: { id: params.businessId } },
      source: params.source,
      externalId: tx.externalId,
      merchantName: tx.merchantName,
      amount: tx.amount,
      currency: tx.currency ?? "USD",
      purchasedAt: tx.purchasedAt,
      rawPayload: tx.rawPayload ? (tx.rawPayload as Prisma.InputJsonValue) : undefined,
      ...(params.companyCardId
        ? { companyCard: { connect: { id: params.companyCardId } } }
        : {}),
      ...(params.employeeId ? { employee: { connect: { id: params.employeeId } } } : {}),
    };

    const row = await db.companyCardTransaction.upsert({
      where: {
        businessId_source_externalId: {
          businessId: params.businessId,
          source: params.source,
          externalId: tx.externalId,
        },
      },
      create: data,
      update: {
        merchantName: tx.merchantName,
        amount: tx.amount,
        currency: tx.currency ?? "USD",
        purchasedAt: tx.purchasedAt,
        rawPayload: tx.rawPayload ? (tx.rawPayload as Prisma.InputJsonValue) : undefined,
      },
    });
    results.push(row);
  }
  return results;
}
