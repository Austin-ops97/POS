import Link from "next/link";
import { Camera } from "lucide-react";
import { requireAuth, hasPermission } from "@/lib/auth";
import { getInventory } from "@/lib/queries";
import { InventoryTable } from "@/components/dashboard/inventory-table";
import { Button } from "@/components/ui/button";
import { PERMISSIONS } from "@/lib/permissions";

export default async function InventoryPage() {
  const ctx = await requireAuth();
  const items = await getInventory(ctx);

  const rows = items.map((item: {
    id: string;
    quantityOnHand: number;
    reorderPoint: number;
    product: { name: string; sku?: string | null };
    location?: { name: string };
  }) => ({
    id: item.id,
    productName: item.product.name,
    sku: item.product.sku ?? null,
    quantityOnHand: item.quantityOnHand,
    reorderPoint: item.reorderPoint,
    locationName: item.location?.name ?? "Main Store",
  }));

  const lowStockCount = rows.filter((r) => r.quantityOnHand <= r.reorderPoint).length;
  const canScan =
    hasPermission(ctx, PERMISSIONS.VIEW_INVENTORY) ||
    hasPermission(ctx, PERMISSIONS.MANAGE_INVENTORY) ||
    hasPermission(ctx, PERMISSIONS.ADJUST_INVENTORY) ||
    hasPermission(ctx, PERMISSIONS.RECEIVE_INVENTORY) ||
    hasPermission(ctx, PERMISSIONS.PERFORM_INVENTORY_COUNT);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Inventory</h1>
          <p className="text-sm text-slate-500">
            Track stock levels across locations
            {lowStockCount > 0 && (
              <span className="ml-2 text-amber-600">
                · {lowStockCount} item{lowStockCount !== 1 ? "s" : ""} low on stock
              </span>
            )}
          </p>
        </div>
        {canScan && (
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href="/inventory/scan">
              <Camera className="mr-2 h-5 w-5" aria-hidden="true" />
              Scan Inventory
            </Link>
          </Button>
        )}
      </div>
      <InventoryTable items={rows} />
    </div>
  );
}
