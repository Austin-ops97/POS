import { NextResponse } from "next/server";
import { requireAuth, hasPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import { seedDemoCatalog } from "@/lib/demo-catalog";
import { handleApiError } from "@/lib/api-utils";
import { createAuditLog } from "@/lib/audit";

export async function POST() {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.MANAGE_PRODUCTS)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await seedDemoCatalog(
      db,
      ctx.business.id,
      ctx.location?.id
    );

    if (result.created) {
      await createAuditLog({
        businessId: ctx.business.id,
        employeeId: ctx.employee.id,
        action: "CREATE",
        entity: "Product",
        entityId: ctx.business.id,
        details: { demoCatalog: true, productCount: result.productCount },
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, "POST /api/business/demo-catalog");
  }
}
