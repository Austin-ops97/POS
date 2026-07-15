import { db } from "@/lib/db";
import { normalizeVendorName } from "./constants";

export async function upsertVendorFromMerchant(params: {
  businessId: string;
  merchant: string;
  categoryId?: string | null;
  spend: number;
}) {
  const normalizedName = normalizeVendorName(params.merchant);
  if (!normalizedName) return null;

  const existing = await db.expenseVendor.findUnique({
    where: {
      businessId_normalizedName: {
        businessId: params.businessId,
        normalizedName,
      },
    },
  });

  if (!existing || existing.deletedAt) {
    return db.expenseVendor.upsert({
      where: {
        businessId_normalizedName: {
          businessId: params.businessId,
          normalizedName,
        },
      },
      create: {
        businessId: params.businessId,
        name: params.merchant.trim(),
        normalizedName,
        categoryId: params.categoryId ?? undefined,
        purchaseCount: 1,
        totalSpend: params.spend,
        averageSpend: params.spend,
        deletedAt: null,
      },
      update: {
        deletedAt: null,
        name: params.merchant.trim(),
        categoryId: params.categoryId ?? undefined,
        purchaseCount: 1,
        totalSpend: params.spend,
        averageSpend: params.spend,
      },
    });
  }

  const purchaseCount = existing.purchaseCount + 1;
  const totalSpend = Number(existing.totalSpend) + params.spend;
  return db.expenseVendor.update({
    where: { id: existing.id },
    data: {
      purchaseCount,
      totalSpend,
      averageSpend: totalSpend / purchaseCount,
      ...(params.categoryId && !existing.categoryId
        ? { categoryId: params.categoryId }
        : {}),
    },
  });
}
