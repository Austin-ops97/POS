import type { PrismaClient } from "@prisma/client";

const DEMO_CATEGORY = "Demo Catalog";

const DEMO_PRODUCTS = [
  { name: "House Coffee", price: 3.5, sku: "DEMO-COFFEE", type: "PHYSICAL" as const },
  { name: "Bottled Water", price: 1.5, sku: "DEMO-WATER", type: "PHYSICAL" as const },
  { name: "Cookie", price: 2.25, sku: "DEMO-COOKIE", type: "PHYSICAL" as const },
  { name: "T-Shirt", price: 18, sku: "DEMO-TEE", type: "PHYSICAL" as const },
  { name: "Gift Card $25", price: 25, sku: "DEMO-GC25", type: "DIGITAL" as const },
  {
    name: "Consultation",
    price: 50,
    sku: "DEMO-CONSULT",
    type: "SERVICE" as const,
  },
];

/**
 * Seeds a small demo catalog for the business if it has no active products.
 * Idempotent when products already exist.
 */
export async function seedDemoCatalog(
  db: PrismaClient,
  businessId: string,
  locationId?: string | null
) {
  const existingCount = await db.product.count({
    where: { businessId, deletedAt: null },
  });
  if (existingCount > 0) {
    return { created: false, productCount: existingCount };
  }

  let category = await db.category.findFirst({
    where: { businessId, name: DEMO_CATEGORY },
  });
  if (!category) {
    category = await db.category.create({
      data: { businessId, name: DEMO_CATEGORY },
    });
  }

  const products = [];
  for (const item of DEMO_PRODUCTS) {
    const product = await db.product.create({
      data: {
        businessId,
        categoryId: category.id,
        name: item.name,
        sku: item.sku,
        price: item.price,
        type: item.type,
        taxable: true,
        isActive: true,
        trackInventory: item.type === "PHYSICAL",
      },
    });
    products.push(product);

    if (locationId && item.type === "PHYSICAL") {
      await db.inventoryItem.create({
        data: {
          businessId,
          locationId,
          productId: product.id,
          quantityOnHand: 25,
          reorderPoint: 5,
        },
      });
    }
  }

  // Demo modifier group for House Coffee
  const coffee = products.find((p) => p.sku === "DEMO-COFFEE");
  if (coffee) {
    const group = await db.modifierGroup.create({
      data: {
        businessId,
        name: "Size",
        required: true,
        minSelect: 1,
        maxSelect: 1,
        options: {
          create: [
            { name: "Small", priceAdjustment: 0 },
            { name: "Medium", priceAdjustment: 0.5 },
            { name: "Large", priceAdjustment: 1 },
          ],
        },
      },
    });
    await db.productModifierGroup.create({
      data: { productId: coffee.id, modifierGroupId: group.id },
    });
  }

  return { created: true, productCount: products.length };
}
