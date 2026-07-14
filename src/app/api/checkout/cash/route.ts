import { NextResponse } from "next/server";
import { createAuditLog } from "@/lib/audit";
import { getClientIp, handleApiError, jsonError } from "@/lib/api-utils";
import { requireAuth, requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import {
  assertOrderInventoryInTransaction,
  createReceiptForOrder,
  deductOrderInventoryInTransaction,
  serializeDecimal,
  updateRegisterSessionCashSales,
} from "@/lib/order-service";
import { toDecimal } from "@/lib/order-service";
import { z } from "zod";

const cashPaymentSchema = z.object({
  orderId: z.string(),
  amountTendered: z.number().min(0).optional(),
  emailedTo: z.string().email().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const ctx = await requireAuth();
    await requirePermission(ctx, PERMISSIONS.PROCESS_SALE);

    const settings = await db.businessSetting.findUnique({
      where: { businessId: ctx.business.id },
    });

    if (settings && !settings.enableCash) {
      return jsonError("Cash payments are disabled for this business", 400);
    }

    const { orderId, amountTendered, emailedTo } = cashPaymentSchema.parse(body);

    const order = await db.order.findFirst({
      where: {
        id: orderId,
        businessId: ctx.business.id,
      },
      include: {
        payments: true,
        receipts: true,
      },
    });

    if (!order) {
      return jsonError("Order not found", 404);
    }

    if (order.status === "PAID") {
      return jsonError("Order is already paid", 400);
    }

    if (!["PENDING_PAYMENT", "HELD"].includes(order.status)) {
      return jsonError(`Cannot pay order with status: ${order.status}`, 400);
    }

    const orderTotal = Number(order.total);

    if (amountTendered !== undefined && amountTendered < orderTotal) {
      return jsonError("Amount tendered is less than order total", 400);
    }

    const changeDue =
      amountTendered !== undefined
        ? Math.round((amountTendered - orderTotal) * 100) / 100
        : undefined;

    const result = await db.$transaction(async (tx) => {
      await assertOrderInventoryInTransaction(tx, ctx.business.id, order.id);

      const payment = await tx.payment.create({
        data: {
          businessId: ctx.business.id,
          orderId: order.id,
          method: "CASH",
          status: "SUCCEEDED",
          amount: toDecimal(orderTotal),
          ...(amountTendered !== undefined
            ? {
                amountTendered: toDecimal(amountTendered),
                changeDue: toDecimal(changeDue ?? 0),
              }
            : {}),
        },
      });

      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          status: "PAID",
          paidAt: new Date(),
          heldAt: null,
        },
      });

      await deductOrderInventoryInTransaction(
        tx,
        ctx.business.id,
        order.id,
        ctx.employee.id
      );

      return { payment, updatedOrder };
    });
    const receipt = await createReceiptForOrder(
      ctx.business.id,
      order.id,
      emailedTo
    );

    await updateRegisterSessionCashSales(
      ctx.business.id,
      order.locationId,
      ctx.employee.id,
      orderTotal
    );

    await createAuditLog({
      businessId: ctx.business.id,
      employeeId: ctx.employee.id,
      action: "PAYMENT",
      entity: "Order",
      entityId: order.id,
      details: {
        method: "CASH",
        amount: orderTotal,
        amountTendered,
        change: amountTendered !== undefined ? amountTendered - orderTotal : undefined,
      },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({
      order: {
        id: result.updatedOrder.id,
        orderNumber: result.updatedOrder.orderNumber,
        status: result.updatedOrder.status,
        total: serializeDecimal(result.updatedOrder.total),
        paidAt: result.updatedOrder.paidAt,
      },
      payment: {
        id: result.payment.id,
        method: result.payment.method,
        status: result.payment.status,
        amount: serializeDecimal(result.payment.amount),
      },
      receipt: {
        id: receipt.id,
        receiptNumber: receipt.receiptNumber,
      },
      change: changeDue,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    return handleApiError(error, "POST /api/checkout/cash");
  }
}
