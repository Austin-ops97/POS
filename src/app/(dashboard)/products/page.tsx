import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ProductsTable } from "@/components/dashboard/products-table";

export default async function ProductsPage() {
  const ctx = await requireAuth();
  const businessId = ctx.business.id;
  const locationId = ctx.location?.id;

  const [products, categories, inventory] = await Promise.all([
    db.product.findMany({
      where: { businessId, deletedAt: null },
      include: { category: true },
      orderBy: { name: "asc" },
    }),
    db.category.findMany({
      where: { businessId, isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
    }),
    locationId
      ? db.inventoryItem.findMany({
          where: { businessId, locationId },
          select: { productId: true, quantityOnHand: true },
        })
      : Promise.resolve([]),
  ]);

  const stockMap = new Map(
    inventory.map((i) => [i.productId, i.quantityOnHand])
  );

  const productRows = products.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    price: Number(p.price),
    categoryId: p.categoryId,
    categoryName: p.category?.name ?? null,
    isActive: p.isActive,
    stock: p.trackInventory ? stockMap.get(p.id) ?? 0 : null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Products</h1>
        <p className="text-sm text-slate-500">
          Manage your product catalog
        </p>
      </div>
      <ProductsTable
        products={productRows}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      />
    </div>
  );
}
