import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError } from "@/lib/api-utils";

function csv(value: string | number | null) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.VIEW_INVENTORY)) {
      throw new Error(`Missing permission: ${PERMISSIONS.VIEW_INVENTORY}`);
    }
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format");
    const canViewCosts = hasPermission(ctx, PERMISSIONS.MANAGE_INVENTORY);
    const items = await db.inventoryItem.findMany({
      where: { businessId: ctx.business.id, product: { deletedAt: null } },
      include: {
        product: { select: { name: true, sku: true, barcode: true, price: true } },
        location: { select: { name: true } },
      },
      orderBy: [{ location: { name: "asc" } }, { product: { name: "asc" } }],
    });
    const rows = items.map((item) => {
      const quantity = item.quantityOnHand;
      const unitCost = canViewCosts ? Number(item.costPerUnit ?? 0) : null;
      const salePrice = canViewCosts ? Number(item.product.price) : null;
      const grossProfitPerUnit = unitCost === null || salePrice === null ? null : salePrice - unitCost;
      const marginPercent = grossProfitPerUnit === null || salePrice === null || salePrice === 0 ? null : (grossProfitPerUnit / salePrice) * 100;
      return {
        product: item.product.name,
        sku: item.product.sku,
        barcode: item.product.barcode,
        location: item.location.name,
        quantityOnHand: quantity,
        reorderPoint: item.reorderPoint,
        status: quantity <= item.reorderPoint ? "LOW" : "OK",
        ...(canViewCosts ? { unitCost: unitCost ?? 0, salePrice: salePrice ?? 0, estimatedInventoryValue: quantity * (unitCost ?? 0), grossProfitPerUnit: grossProfitPerUnit ?? 0, marginPercent: marginPercent ?? 0 } : {}),
      };
    });
    if (format === "csv") {
      const headers = Object.keys(rows[0] ?? { product: "", sku: "", barcode: "", location: "", quantityOnHand: 0, reorderPoint: 0, status: "" });
      const body = [headers.join(","), ...rows.map((row) => headers.map((key) => csv(row[key as keyof typeof row] as string | number | null)).join(","))].join("\n");
      return new NextResponse(body, { headers: { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=inventory-report.csv" } });
    }
    return NextResponse.json({ generatedAt: new Date().toISOString(), canViewCosts, rows });
  } catch (error) {
    return handleApiError(error, "GET /api/inventory/report");
  }
}
