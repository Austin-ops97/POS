import { requireAuth } from "@/lib/auth";
import { getProducts, getCategories, getInventory } from "@/lib/queries";
import { ProductsTable } from "@/components/dashboard/products-table";


export const metadata = { title: "Products" };

export default async function ProductsPage() {
  const ctx = await requireAuth();
  const [products, categories, inventory] = await Promise.all([
    getProducts(ctx),
    getCategories(ctx),
    getInventory(ctx),
  ]);

  const stockMap = new Map(
    inventory.map((i: { productId: string; quantityOnHand: number }) => [i.productId, i.quantityOnHand])
  );

  const productRows = (products as Array<{
    id: string;
    name: string;
    sku?: string | null;
    price: unknown;
    categoryId?: string | null;
    category?: { name: string } | null;
    isActive: boolean;
    trackInventory?: boolean;
  }>).map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku ?? null,
    price: Number(p.price),
    categoryId: p.categoryId ?? null,
    categoryName: p.category?.name ?? null,
    isActive: p.isActive,
    stock: p.trackInventory !== false ? stockMap.get(p.id) ?? 0 : null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Products</h1>
        <p className="text-sm text-slate-500">Manage your product catalog</p>
      </div>
      <ProductsTable
        products={productRows}
        categories={categories.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }))}
      />
    </div>
  );
}
