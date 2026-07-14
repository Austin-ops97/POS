import { requireAuth, hasPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import { InventoryScanClient } from "@/components/dashboard/inventory-scan-client";
import { redirect } from "next/navigation";

export default async function InventoryScanPage() {
  const ctx = await requireAuth();

  const canScan =
    hasPermission(ctx, PERMISSIONS.VIEW_INVENTORY) ||
    hasPermission(ctx, PERMISSIONS.MANAGE_INVENTORY) ||
    hasPermission(ctx, PERMISSIONS.ADJUST_INVENTORY) ||
    hasPermission(ctx, PERMISSIONS.RECEIVE_INVENTORY) ||
    hasPermission(ctx, PERMISSIONS.PERFORM_INVENTORY_COUNT) ||
    hasPermission(ctx, PERMISSIONS.MANAGE_PRODUCTS);

  if (!canScan) {
    redirect("/inventory");
  }

  const locations = await db.location.findMany({
    where: {
      businessId: ctx.business.id,
      isActive: true,
      deletedAt: null,
    },
    select: { id: true, name: true, isDefault: true },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });

  const accessible =
    ctx.employee.role.name === "Owner" || ctx.employee.locations.length === 0
      ? locations
      : locations.filter((l) =>
          ctx.employee.locations.some((el) => el.locationId === l.id)
        );

  return (
    <InventoryScanClient
      locations={accessible.map((l) => ({ id: l.id, name: l.name }))}
      defaultLocationId={
        accessible.find((l) => l.isDefault)?.id ?? accessible[0]?.id
      }
      canManageProducts={hasPermission(ctx, PERMISSIONS.MANAGE_PRODUCTS)}
    />
  );
}
