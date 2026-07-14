import type { Prisma, PrismaClient } from "@prisma/client";
import {
  normalizeBarcode,
  type NormalizedBarcode,
} from "@/lib/barcodes";

type DbClient = PrismaClient | Prisma.TransactionClient;

export class BarcodeAssignmentError extends Error {
  constructor(
    message: string,
    public code:
      | "DUPLICATE"
      | "INVALID"
      | "NOT_FOUND" = "DUPLICATE",
    public existingProductId?: string
  ) {
    super(message);
    this.name = "BarcodeAssignmentError";
  }
}

export async function findBarcodeAssignment(
  db: DbClient,
  businessId: string,
  barcode: NormalizedBarcode
) {
  const candidates = [
    barcode.normalizedValue,
    barcode.gtin14,
    barcode.gtin14?.slice(1),
    barcode.gtin14?.slice(2),
  ].filter((v): v is string => Boolean(v));

  const unique = [...new Set(candidates)];
  if (unique.length === 0) return null;

  return db.productBarcode.findFirst({
    where: {
      businessId,
      normalizedValue: { in: unique },
      product: { deletedAt: null },
    },
    include: {
      product: {
        include: {
          category: { select: { id: true, name: true } },
        },
      },
      variant: true,
    },
  });
}

/**
 * Upsert primary barcode assignment for a product.
 * Keeps Product.barcode in sync for backward compatibility.
 */
export async function syncProductPrimaryBarcode(
  db: DbClient,
  params: {
    businessId: string;
    productId: string;
    barcode: string | null | undefined;
    variantId?: string | null;
  }
): Promise<NormalizedBarcode | null> {
  const raw = params.barcode?.trim();

  // Clear primary product barcode assignments when empty
  if (!raw) {
    if (!params.variantId) {
      await db.productBarcode.deleteMany({
        where: {
          businessId: params.businessId,
          productId: params.productId,
          variantId: null,
          isPrimary: true,
        },
      });
    }
    return null;
  }

  const normalized = normalizeBarcode(raw);
  if (!normalized.normalizedValue) {
    throw new BarcodeAssignmentError("Invalid barcode value", "INVALID");
  }

  const existing = await db.productBarcode.findFirst({
    where: {
      businessId: params.businessId,
      normalizedValue: normalized.normalizedValue,
    },
  });

  if (
    existing &&
    (existing.productId !== params.productId ||
      (existing.variantId ?? null) !== (params.variantId ?? null))
  ) {
    throw new BarcodeAssignmentError(
      "This barcode is already assigned to another product in this business",
      "DUPLICATE",
      existing.productId
    );
  }

  if (existing) {
    await db.productBarcode.update({
      where: { id: existing.id },
      data: {
        rawValue: normalized.rawValue,
        format: normalized.format,
        isPrimary: true,
      },
    });
  } else {
    // Demote previous primary for this product/variant
    await db.productBarcode.updateMany({
      where: {
        businessId: params.businessId,
        productId: params.productId,
        variantId: params.variantId ?? null,
        isPrimary: true,
      },
      data: { isPrimary: false },
    });

    await db.productBarcode.create({
      data: {
        businessId: params.businessId,
        productId: params.productId,
        variantId: params.variantId ?? null,
        rawValue: normalized.rawValue,
        normalizedValue: normalized.normalizedValue,
        format: normalized.format,
        isPrimary: true,
      },
    });
  }

  return normalized;
}
