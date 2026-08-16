import { NextResponse } from "next/server";
import { requireAuth, hasPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import { createAuditLog } from "@/lib/audit";
import { handleApiError } from "@/lib/api-utils";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.MANAGE_LOCATIONS)) throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_LOCATIONS}`);
    const { id } = await params;
    const tax = await db.taxRate.findFirst({ where: { id, businessId: ctx.business.id } });
    if (!tax) return NextResponse.json({ error: "Tax rate not found" }, { status: 404 });
    await db.taxRate.delete({ where: { id } });
    await createAuditLog({ businessId: ctx.business.id, employeeId: ctx.employee.id, action: "DELETE", entity: "TaxRate", entityId: id, details: { name: tax.name, rate: tax.rate } });
    return NextResponse.json({ success: true });
  } catch (error) { return handleApiError(error, "DELETE /api/tax-rates/[id]"); }
}
