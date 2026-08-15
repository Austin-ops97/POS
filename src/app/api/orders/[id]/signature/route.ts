import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, hasPermission } from "@/lib/auth";
import { signatureCaptureSchema } from "@/lib/validations";
import { PERMISSIONS } from "@/lib/permissions";
import { createAuditLog } from "@/lib/audit";
import { handleApiError } from "@/lib/api-utils";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.VIEW_REPORTS) && !hasPermission(ctx, PERMISSIONS.PROCESS_SALE)) {
      throw new Error("Missing permission to view signatures");
    }
    const { id } = await params;
    const order = await db.order.findFirst({ where: { id, businessId: ctx.business.id }, select: { id: true } });
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    const signatures = await db.signature.findMany({ where: { orderId: id, businessId: ctx.business.id, revokedAt: null }, orderBy: { capturedAt: "desc" } });
    return NextResponse.json(signatures);
  } catch (error) {
    return handleApiError(error, "GET /api/orders/[id]/signature");
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.PROCESS_SALE)) {
      throw new Error(`Missing permission: ${PERMISSIONS.PROCESS_SALE}`);
    }
    const { id } = await params;
    const settings = await db.businessSetting.findUnique({ where: { businessId: ctx.business.id }, select: { enableDigitalSignatures: true } });
    if (!settings?.enableDigitalSignatures) return NextResponse.json({ error: "Digital signatures are disabled" }, { status: 409 });
    const order = await db.order.findFirst({ where: { id, businessId: ctx.business.id }, select: { id: true, customerId: true, status: true } });
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    if (!["PAID", "REFUNDED", "PARTIALLY_REFUNDED"].includes(order.status)) {
      return NextResponse.json({ error: "Signatures can only be captured for completed orders" }, { status: 400 });
    }
    const data = signatureCaptureSchema.parse(await request.json());
    const signature = await db.signature.create({
      data: {
        businessId: ctx.business.id,
        orderId: id,
        customerId: order.customerId,
        employeeId: ctx.employee.id,
        ...data,
      },
    });
    await createAuditLog({ businessId: ctx.business.id, employeeId: ctx.employee.id, action: "CREATE", entity: "Signature", entityId: signature.id, details: { orderId: id, dataFormat: data.dataFormat, signerName: data.signerName } });
    return NextResponse.json(signature, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/orders/[id]/signature");
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.MANAGE_CUSTOMERS)) throw new Error("Missing permission to revoke signatures");
    const { id } = await params;
    const body = await request.json();
    const signature = await db.signature.findFirst({ where: { id: body.signatureId, orderId: id, businessId: ctx.business.id, revokedAt: null } });
    if (!signature) return NextResponse.json({ error: "Signature not found" }, { status: 404 });
    const revoked = await db.signature.update({ where: { id: signature.id }, data: { revokedAt: new Date() } });
    await createAuditLog({ businessId: ctx.business.id, employeeId: ctx.employee.id, action: "UPDATE", entity: "Signature", entityId: signature.id, details: { action: "revoke", orderId: id } });
    return NextResponse.json(revoked);
  } catch (error) {
    return handleApiError(error, "DELETE /api/orders/[id]/signature");
  }
}
