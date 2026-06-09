import { NextResponse } from "next/server";
import { handleApiError, jsonError } from "@/lib/api-utils";
import { requireAuth, requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import { serializeDecimal } from "@/lib/order-service";
import { z } from "zod";

type OrderStatus =
  | "DRAFT"
  | "HELD"
  | "PENDING_PAYMENT"
  | "PAID"
  | "PARTIALLY_REFUNDED"
  | "REFUNDED"
  | "CANCELED"
  | "FAILED";

const ordersQuerySchema = z.object({
  status: z
    .enum([
      "DRAFT",
      "HELD",
      "PENDING_PAYMENT",
      "PAID",
      "PARTIALLY_REFUNDED",
      "REFUNDED",
      "CANCELED",
      "FAILED",
    ])
    .optional(),
  locationId: z.string().optional(),
  customerId: z.string().optional(),
  employeeId: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["createdAt", "total", "orderNumber"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    await requirePermission(ctx, PERMISSIONS.PROCESS_SALE);

    const { searchParams } = new URL(request.url);
    const query = ordersQuerySchema.parse(Object.fromEntries(searchParams));

    const where: Record<string, unknown> = {
      businessId: ctx.business.id,
    };

    if (query.status) {
      where.status = query.status as OrderStatus;
    }

    if (query.locationId) {
      where.locationId = query.locationId;
    }

    if (query.customerId) {
      where.customerId = query.customerId;
    }

    if (query.employeeId) {
      where.employeeId = query.employeeId;
    }

    if (query.startDate || query.endDate) {
      const createdAt: { gte?: Date; lte?: Date } = {};
      if (query.startDate) {
        createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        createdAt.lte = new Date(query.endDate);
      }
      where.createdAt = createdAt;
    }

    if (query.search) {
      where.OR = [
        { orderNumber: { contains: query.search, mode: "insensitive" } },
        { customer: { firstName: { contains: query.search, mode: "insensitive" } } },
        { customer: { lastName: { contains: query.search, mode: "insensitive" } } },
        { customer: { email: { contains: query.search, mode: "insensitive" } } },
      ];
    }

    const skip = (query.page - 1) * query.limit;

    const [orders, total] = await Promise.all([
      db.order.findMany({
        where,
        include: {
          location: { select: { id: true, name: true } },
          customer: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          employee: { select: { id: true, name: true } },
          payments: {
            select: {
              id: true,
              method: true,
              status: true,
              amount: true,
            },
          },
          _count: { select: { items: true, refunds: true } },
        },
        orderBy: { [query.sortBy]: query.sortOrder },
        skip,
        take: query.limit,
      }),
      db.order.count({ where }),
    ]);

    return NextResponse.json({
      orders: orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        subtotal: serializeDecimal(order.subtotal),
        discountAmount: serializeDecimal(order.discountAmount),
        taxAmount: serializeDecimal(order.taxAmount),
        total: serializeDecimal(order.total),
        itemCount: order._count.items,
        refundCount: order._count.refunds,
        location: order.location,
        customer: order.customer,
        employee: order.employee,
        payments: order.payments.map((p) => ({
          id: p.id,
          method: p.method,
          status: p.status,
          amount: serializeDecimal(p.amount),
        })),
        heldAt: order.heldAt,
        paidAt: order.paidAt,
        createdAt: order.createdAt,
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    return handleApiError(error, "GET /api/orders");
  }
}
