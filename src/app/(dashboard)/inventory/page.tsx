import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { InventoryTable } from "@/components/dashboard/inventory-table";

export default async function InventoryPage() {
  const ctx = await requireAuth();
  const businessId = ctx.business.id;

  const items = await db.inventoryItem.findMany({
    where: { businessId },
    include: {
      product: true,
      location: true,
    },
    orderBy: { quantityOnHand: "asc" },
  });

  const rows = items.map((item) => ({
    id: item.id,
    productName: item.product.name,
    sku: item.product.sku,
    quantityOnHand: item.quantityOnHand,
    reorderPoint: item.reorderPoint,
    locationName: item.location.name,
  }));

  const lowStockCount = rows.filter(
    (r) => r.quantityOnHand <= r.reorderPoint
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventory</h1>
          <p className="text-sm text-slate-500">
            Track stock levels across locations
            {lowStockCount > 0 && (
              <span className="ml-2 text-amber-600">
                · {lowStockCount} item{lowStockCount !== 1 ? "s" : ""} low on stock
              </span>
            )}
          </p>
        </div>
      </div>
      <InventoryTable items={rows} />
    </div>
  );
}
