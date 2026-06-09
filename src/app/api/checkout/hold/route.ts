import { NextResponse } from "next/server";
import { createAuditLog } from "@/lib/audit";
import { getClientIp, handleApiError, jsonError } from "@/lib/api-utils";
import { requireAuth, requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import {
  createOrderRecord,
  serializeDecimal,
  verifyLocationAccess,
} from "@/lib/order-service";
import { checkoutSchema } from "@/lib/validations";
import { z } from "zod";

const holdOrderSchema = checkoutSchema.omit({ paymentMethod: true }).extend({
  orderId: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    await requirePermission(ctx, PERMISSIONS.PROCESS_SALE);

    const body = await request.json();
    const parsed = holdOrderSchema.parse(body);

    await verifyLocationAccess(ctx, parsed.locationId);

    if (parsed.orderId) {
      const existingOrder = await db.order.findFirst({
        where: {
          id: parsed.orderId,
          businessId: ctx.business.id,
          status: { in: ["HELD", "DRAFT", "PENDING_PAYMENT"] },
        },
      });

      if (!existingOrder) {
        return jsonError("Held order not found or cannot be updated", 404);
      }

      await db.orderItem.deleteMany({ where: { orderId: existingOrder.id } });
      await db.orderDiscount.deleteMany({ where: { orderId: existingOrder.id } });
      await db.order.delete({ where: { id: existingOrder.id } });
    }

    const { order, totals } = await createOrderRecord({
      businessId: ctx.business.id,
      locationId: parsed.locationId,
      employeeId: ctx.employee.id,
      customerId: parsed.customerId,
      items: parsed.items,
      discounts: parsed.discounts,
      notes: parsed.notes,
      status: "HELD",
      heldAt: new Date(),
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
        status: "HELD",
      },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        heldAt: order.heldAt,
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
    return handleApiError(error, "POST /api/checkout/hold");
  }
}
