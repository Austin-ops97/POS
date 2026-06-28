import { Prisma } from "@prisma/client";
import type { AuthContext } from "./auth";
import { db } from "./db";
import {
  calculateOrderTotals,
  type CartItemInput,
  type DiscountInput,
} from "./order-calculator";
import { generateOrderNumber, generateReceiptNumber } from "./utils";

export function toDecimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(2));
}

type OrderStatus =
  | "DRAFT"
  | "HELD"
  | "PENDING_PAYMENT"
  | "PAID"
  | "PARTIALLY_REFUNDED"
  | "REFUNDED"
  | "CANCELED"
  | "FAILED";

export class OrderServiceError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "OrderServiceError";
  }
}

export async function verifyLocationAccess(
  ctx: AuthContext,
  locationId: string
) {
  const location = await db.location.findFirst({
    where: {
      id: locationId,
      businessId: ctx.business.id,
      isActive: true,
      deletedAt: null,
    },
  });

  if (!location) {
    throw new OrderServiceError("Location not found", 404);
  }

  if (ctx.employee.role.name !== "Owner" && ctx.employee.locations.length > 0) {
    const hasAccess = ctx.employee.locations.some(
      (el) => el.locationId === locationId
    );
    if (!hasAccess) {
      throw new OrderServiceError("No access to this location", 403);
    }
  }

  return location;
}

export async function resolveCartItemsFromDb(
  businessId: string,
  items: CartItemInput[],
  allowCustomItems: boolean
): Promise<CartItemInput[]> {
  const resolved: CartItemInput[] = [];

  for (const item of items) {
    if (item.productId) {
      const product = await db.product.findFirst({
        where: {
          id: item.productId,
          businessId,
          isActive: true,
          deletedAt: null,
        },
      });

      if (!product) {
        throw new OrderServiceError(`Product not found: ${item.productId}`, 404);
      }

      let unitPrice = Number(product.price);
      let name = product.name;
      let sku = product.sku ?? undefined;

      if (item.variantId) {
        const variant = await db.productVariant.findFirst({
          where: { id: item.variantId, productId: product.id, isActive: true },
        });

        if (!variant) {
          throw new OrderServiceError(`Variant not found: ${item.variantId}`, 404);
        }

        unitPrice = Number(variant.price ?? product.price);
        name = `${product.name} - ${variant.name}`;
        sku = variant.sku ?? sku;
      }

      resolved.push({
        ...item,
        name,
        sku,
        unitPrice,
        taxable: product.taxable,
      });
    } else {
      if (!allowCustomItems) {
        throw new OrderServiceError("Custom items are not allowed", 400);
      }
      resolved.push(item);
    }
  }

  return resolved;
}

export async function getTaxRatesForLocation(
  businessId: string,
  locationId: string
) {
  const rates = await db.taxRate.findMany({
    where: {
      businessId,
      isActive: true,
      OR: [{ locationId }, { locationId: null }],
    },
  });

  return rates.map((r) => ({
    name: r.name,
    rate: Number(r.rate),
    appliesToProducts: r.appliesToProducts,
    appliesToServices: r.appliesToServices,
  }));
}

export async function getProductTypesMap(
  businessId: string,
  productIds: string[]
) {
  if (productIds.length === 0) return {};

  const products = await db.product.findMany({
    where: { businessId, id: { in: productIds } },
    select: { id: true, type: true },
  });

  return Object.fromEntries(products.map((p) => [p.id, p.type]));
}

type CreateOrderInput = {
  businessId: string;
  locationId: string;
  employeeId: string;
  customerId?: string;
  items: CartItemInput[];
  discounts?: DiscountInput[];
  notes?: string;
  status: OrderStatus;
  heldAt?: Date;
};

export async function createOrderRecord(input: CreateOrderInput) {
  const settings = await db.businessSetting.findUnique({
    where: { businessId: input.businessId },
  });
  const allowCustomItems = settings?.allowCustomItems ?? true;

  const resolvedItems = await resolveCartItemsFromDb(
    input.businessId,
    input.items,
    allowCustomItems
  );

  const taxRates = await getTaxRatesForLocation(
    input.businessId,
    input.locationId
  );

  const productIds = resolvedItems
    .map((i) => i.productId)
    .filter((id): id is string => Boolean(id));

  const productTypes = await getProductTypesMap(input.businessId, productIds);

  const totals = calculateOrderTotals(
    resolvedItems,
    input.discounts ?? [],
    taxRates,
    productTypes
  );

  if (input.customerId) {
    const customer = await db.customer.findFirst({
      where: {
        id: input.customerId,
        businessId: input.businessId,
        deletedAt: null,
      },
    });
    if (!customer) {
      throw new OrderServiceError("Customer not found", 404);
    }
  }

  const orderNumber = generateOrderNumber();

  const order = await db.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        businessId: input.businessId,
        locationId: input.locationId,
        orderNumber,
        status: input.status,
        employeeId: input.employeeId,
        customerId: input.customerId,
        subtotal: toDecimal(totals.subtotal),
        discountAmount: toDecimal(totals.discountAmount),
        taxAmount: toDecimal(totals.taxAmount),
        total: toDecimal(totals.total),
        notes: input.notes,
        heldAt: input.heldAt,
        items: {
          create: totals.items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId,
            name: item.name,
            sku: item.sku,
            quantity: item.quantity,
            unitPrice: toDecimal(item.unitPrice),
            discountAmount: toDecimal(item.discountAmount),
            taxAmount: toDecimal(item.taxAmount),
            total: toDecimal(item.total),
            modifiers: item.modifiers
              ? (item.modifiers as object)
              : undefined,
          })),
        },
        appliedDiscounts: input.discounts?.length
          ? {
              create: input.discounts.map((d) => ({
                name: d.name,
                type: d.type,
                value: toDecimal(d.value),
                amount: toDecimal(
                  d.type === "PERCENTAGE"
                    ? totals.discountAmount * (d.value / 100)
                    : d.value
                ),
              })),
            }
          : undefined,
      },
      include: {
        items: true,
        appliedDiscounts: true,
        location: true,
        customer: true,
        employee: true,
      },
    });

    return created;
  });

  return { order, totals };
}

type InventoryOrderItem = {
  productId: string | null;
  quantity: number;
  name: string;
  product: { trackInventory: boolean; name: string } | null;
};

async function loadInventoryOrderItems(
  businessId: string,
  orderId: string,
  tx: Prisma.TransactionClient | typeof db
) {
  return tx.order.findFirst({
    where: { id: orderId, businessId },
    include: {
      items: {
        include: {
          product: { select: { trackInventory: true, name: true } },
        },
      },
    },
  });
}

async function assertSufficientInventory(
  tx: Prisma.TransactionClient,
  locationId: string,
  items: InventoryOrderItem[]
) {
  for (const item of items) {
    if (!item.productId || !item.product?.trackInventory) continue;

    const inventoryItem = await tx.inventoryItem.findUnique({
      where: {
        locationId_productId: {
          locationId,
          productId: item.productId,
        },
      },
    });

    const available = inventoryItem?.quantityOnHand ?? 0;
    const productName = item.product.name || item.name;

    if (available < item.quantity) {
      throw new OrderServiceError(
        `Insufficient stock for ${productName}: ${available} available, ${item.quantity} requested`,
        400
      );
    }
  }
}

async function deductInventoryItems(
  tx: Prisma.TransactionClient,
  businessId: string,
  locationId: string,
  orderId: string,
  items: InventoryOrderItem[],
  employeeId?: string
) {
  for (const item of items) {
    if (!item.productId || !item.product?.trackInventory) continue;

    const productName = item.product.name || item.name;

    const inventoryItem = await tx.inventoryItem.findUnique({
      where: {
        locationId_productId: {
          locationId,
          productId: item.productId,
        },
      },
    });

    if (!inventoryItem) {
      throw new OrderServiceError(
        `Insufficient stock for ${productName}: 0 available, ${item.quantity} requested`,
        400
      );
    }

    const previousQty = inventoryItem.quantityOnHand;
    const updated = await tx.inventoryItem.updateMany({
      where: {
        id: inventoryItem.id,
        quantityOnHand: { gte: item.quantity },
      },
      data: {
        quantityOnHand: { decrement: item.quantity },
      },
    });

    if (updated.count === 0) {
      const current = await tx.inventoryItem.findUnique({
        where: { id: inventoryItem.id },
      });
      const available = current?.quantityOnHand ?? 0;
      throw new OrderServiceError(
        `Insufficient stock for ${productName}: ${available} available, ${item.quantity} requested`,
        400
      );
    }

    const newQty = previousQty - item.quantity;

    await tx.inventoryMovement.create({
      data: {
        businessId,
        inventoryItemId: inventoryItem.id,
        type: "SALE",
        quantity: -item.quantity,
        previousQty,
        newQty,
        referenceId: orderId,
        employeeId,
      },
    });
  }
}

export async function assertOrderInventoryInTransaction(
  tx: Prisma.TransactionClient,
  businessId: string,
  orderId: string
) {
  const order = await loadInventoryOrderItems(businessId, orderId, tx);
  if (!order) {
    throw new OrderServiceError("Order not found", 404);
  }
  await assertSufficientInventory(tx, order.locationId, order.items);
  return order;
}

export async function validateOrderInventoryAvailability(
  businessId: string,
  orderId: string
) {
  await db.$transaction(async (tx) => {
    const order = await loadInventoryOrderItems(businessId, orderId, tx);
    if (!order) {
      throw new OrderServiceError("Order not found", 404);
    }
    await assertSufficientInventory(tx, order.locationId, order.items);
  });
}

export async function deductInventoryForOrder(
  businessId: string,
  orderId: string,
  employeeId?: string
) {
  await db.$transaction(async (tx) => {
    const order = await loadInventoryOrderItems(businessId, orderId, tx);
    if (!order) return;

    await assertSufficientInventory(tx, order.locationId, order.items);
    await deductInventoryItems(
      tx,
      businessId,
      order.locationId,
      orderId,
      order.items,
      employeeId
    );
  });
}

export async function deductOrderInventoryInTransaction(
  tx: Prisma.TransactionClient,
  businessId: string,
  orderId: string,
  employeeId?: string
) {
  const order = await loadInventoryOrderItems(businessId, orderId, tx);
  if (!order) {
    throw new OrderServiceError("Order not found", 404);
  }

  await deductInventoryItems(
    tx,
    businessId,
    order.locationId,
    orderId,
    order.items,
    employeeId
  );
}

export async function deductInventoryForOrderInTransaction(
  tx: Prisma.TransactionClient,
  businessId: string,
  orderId: string,
  employeeId?: string
) {
  await assertOrderInventoryInTransaction(tx, businessId, orderId);
  await deductOrderInventoryInTransaction(tx, businessId, orderId, employeeId);
}

export async function returnInventoryForRefund(
  businessId: string,
  locationId: string,
  orderItemId: string,
  quantity: number,
  employeeId?: string,
  referenceId?: string
) {
  const orderItem = await db.orderItem.findFirst({
    where: { id: orderItemId },
    include: { product: true, order: true },
  });

  if (
    !orderItem?.productId ||
    !orderItem.product?.trackInventory ||
    orderItem.order.businessId !== businessId
  ) {
    return;
  }

  const inventoryItem = await db.inventoryItem.findUnique({
    where: {
      locationId_productId: {
        locationId,
        productId: orderItem.productId,
      },
    },
  });

  if (!inventoryItem) return;

  const previousQty = inventoryItem.quantityOnHand;
  const newQty = previousQty + quantity;

  await db.$transaction([
    db.inventoryItem.update({
      where: { id: inventoryItem.id },
      data: { quantityOnHand: newQty },
    }),
    db.inventoryMovement.create({
      data: {
        businessId,
        inventoryItemId: inventoryItem.id,
        type: "RETURN_TO_STOCK",
        quantity,
        previousQty,
        newQty,
        referenceId,
        employeeId,
      },
    }),
  ]);
}

export async function createReceiptForOrder(
  businessId: string,
  orderId: string,
  emailedTo?: string
) {
  const existing = await db.receipt.findFirst({
    where: { orderId, businessId },
  });

  if (existing) return existing;

  return db.receipt.create({
    data: {
      businessId,
      orderId,
      receiptNumber: generateReceiptNumber(),
      emailedTo,
      printed: false,
    },
  });
}

export async function markOrderPaid(
  businessId: string,
  orderId: string,
  employeeId?: string
) {
  const order = await db.order.findFirst({
    where: { id: orderId, businessId },
  });

  if (!order) {
    throw new OrderServiceError("Order not found", 404);
  }

  if (order.status === "PAID") {
    return order;
  }

  if (!["PENDING_PAYMENT", "HELD"].includes(order.status)) {
    throw new OrderServiceError(
      `Cannot mark order as paid from status: ${order.status}`,
      400
    );
  }

  const updated = await db.order.update({
    where: { id: orderId },
    data: {
      status: "PAID",
      paidAt: new Date(),
      heldAt: null,
    },
  });

  await deductInventoryForOrder(businessId, orderId, employeeId);
  await createReceiptForOrder(businessId, orderId);

  return updated;
}

export async function updateRegisterSessionCashSales(
  businessId: string,
  locationId: string,
  employeeId: string,
  amount: number
) {
  const session = await db.registerSession.findFirst({
    where: {
      businessId,
      locationId,
      employeeId,
      status: "OPEN",
    },
  });

  if (session) {
    await db.registerSession.update({
      where: { id: session.id },
      data: {
        cashSales: { increment: toDecimal(amount) },
      },
    });
  }
}

export async function updateRegisterSessionCashRefunds(
  businessId: string,
  locationId: string,
  employeeId: string,
  amount: number
) {
  const session = await db.registerSession.findFirst({
    where: {
      businessId,
      locationId,
      employeeId,
      status: "OPEN",
    },
  });

  if (session) {
    await db.registerSession.update({
      where: { id: session.id },
      data: {
        cashRefunds: { increment: toDecimal(amount) },
      },
    });
  }
}

export function serializeDecimal(value: { toString(): string } | number | null) {
  if (value === null) return 0;
  return Number(value);
}
