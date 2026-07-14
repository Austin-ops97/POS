import { NextResponse } from "next/server";
import { createAuditLog } from "@/lib/audit";
import { getClientIp, handleApiError } from "@/lib/api-utils";
import { requireAuth, requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { createOrderRecord, serializeDecimal, verifyLocationAccess } from "@/lib/order-service";
import { checkoutSchema } from "@/lib/validations";
import { z } from "zod";

const createOrderSchema = checkoutSchema.omit({ paymentMethod: true });

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const ctx = await requireAuth();
    await requirePermission(ctx, PERMISSIONS.PROCESS_SALE);

    const parsed = createOrderSchema.parse(body);

    await verifyLocationAccess(ctx, parsed.locationId);

    const { order, totals } = await createOrderRecord({
      businessId: ctx.business.id,
      locationId: parsed.locationId,
      employeeId: ctx.employee.id,
      customerId: parsed.customerId,
      items: parsed.items,
      discounts: parsed.discounts,
      notes: parsed.notes,
      status: "PENDING_PAYMENT",
    });

    await createAuditLog({
      businessId: ctx.business.id,
      employeeId: ctx.employee.id,
      action: "CREATE",
      entity: "Order",
      entityId: order.id,
      details: {
        orderNumber: order.orderNumber,
        total: totals.total,
        status: "PENDING_PAYMENT",
      },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        subtotal: serializeDecimal(order.subtotal),
        discountAmount: serializeDecimal(order.discountAmount),
        taxAmount: serializeDecimal(order.taxAmount),
        total: serializeDecimal(order.total),
        items: order.items.map((item) => ({
          id: item.id,
          name: item.name,
          sku: item.sku,
          quantity: item.quantity,
          unitPrice: serializeDecimal(item.unitPrice),
          total: serializeDecimal(item.total),
        })),
      },
      totals,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    return handleApiError(error, "POST /api/checkout");
  }
}
