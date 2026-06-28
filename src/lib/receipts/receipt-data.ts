import type { OrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { formatCurrency } from "@/lib/utils";

export class ReceiptNotFoundError extends Error {
  readonly code = "RECEIPT_NOT_FOUND" as const;

  constructor(message = "Receipt not found for this order") {
    super(message);
    this.name = "ReceiptNotFoundError";
  }
}

export class ReceiptAccessError extends Error {
  readonly code = "RECEIPT_ACCESS_DENIED" as const;

  constructor(message = "Order not found") {
    super(message);
    this.name = "ReceiptAccessError";
  }
}

export type ReceiptLineItem = {
  name: string;
  sku?: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
};

export type ReceiptPaymentInfo = {
  method: string;
  amount: number;
  status: string;
  cardBrand?: string;
  cardLast4?: string;
  amountTendered?: number;
  changeDue?: number;
  stripePaymentIntentId?: string;
  createdAt: string;
};

export type ReceiptRefundInfo = {
  amount: number;
  taxAmount: number;
  reason: string;
  reasonNote?: string;
  createdAt: string;
  stripeRefundId?: string;
};

export type ReceiptSettingsView = {
  footer?: string;
  returnPolicy?: string;
  showCashier: boolean;
  showCustomer: boolean;
  showSku: boolean;
  showBusinessEmail: boolean;
  showBusinessPhone: boolean;
};

export type ReceiptData = {
  receiptId: string;
  receiptNumber: string;
  orderId: string;
  orderNumber: string;
  orderStatus: OrderStatus;
  createdAt: string;
  paidAt?: string;
  business: {
    name: string;
    legalName?: string;
    phone?: string;
    email?: string;
    logoUrl?: string;
  };
  location: {
    name: string;
    addressLines: string[];
  };
  settings: ReceiptSettingsView;
  employee?: { name: string };
  customer?: { name: string; email?: string; phone?: string };
  lineItems: ReceiptLineItem[];
  discounts: Array<{ name: string; amount: number }>;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  payments: ReceiptPaymentInfo[];
  refunds: ReceiptRefundInfo[];
  totalRefunded: number;
  netPaid: number;
  isRefunded: boolean;
  isPartiallyRefunded: boolean;
  emailedTo?: string;
  lastEmailedAt?: string;
  printed: boolean;
  printedAt?: string;
};

function formatAddress(parts: Array<string | null | undefined>): string[] {
  return parts.filter((p): p is string => Boolean(p && p.trim()));
}

function formatLocationAddress(location: {
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
}): string[] {
  const cityStateZip = [location.city, location.state, location.zip]
    .filter(Boolean)
    .join(", ")
    .replace(/, (\d)/, " $1");

  return formatAddress([
    location.street ?? undefined,
    cityStateZip || undefined,
    location.country && location.country !== "US" ? location.country : undefined,
  ]);
}

export async function getReceiptData(
  businessId: string,
  orderId: string
): Promise<ReceiptData> {
  const order = await db.order.findFirst({
    where: { id: orderId, businessId },
    include: {
      items: true,
      payments: { where: { status: "SUCCEEDED" }, orderBy: { createdAt: "asc" } },
      refunds: { orderBy: { createdAt: "asc" } },
      receipts: { orderBy: { createdAt: "desc" }, take: 1 },
      customer: true,
      employee: true,
      location: true,
      appliedDiscounts: true,
      business: {
        include: { settings: true },
      },
    },
  });

  if (!order) {
    throw new ReceiptAccessError();
  }

  const receipt = order.receipts[0];
  if (!receipt) {
    throw new ReceiptNotFoundError();
  }

  const settings = order.business.settings;
  const totalRefunded = order.refunds.reduce(
    (sum, r) => sum + Number(r.amount),
    0
  );
  const netPaid = Number(order.total) - totalRefunded;

  const customerName = order.customer
    ? [order.customer.firstName, order.customer.lastName].filter(Boolean).join(" ")
    : undefined;

  return {
    receiptId: receipt.id,
    receiptNumber: receipt.receiptNumber,
    orderId: order.id,
    orderNumber: order.orderNumber,
    orderStatus: order.status,
    createdAt: order.createdAt.toISOString(),
    paidAt: order.paidAt?.toISOString(),
    business: {
      name: order.business.name,
      legalName: order.business.legalName ?? undefined,
      phone: order.business.phone ?? undefined,
      email: order.business.email ?? undefined,
      logoUrl: order.business.logoUrl ?? undefined,
    },
    location: {
      name: order.location.name,
      addressLines: formatLocationAddress(order.location),
    },
    settings: {
      footer: settings?.receiptFooter ?? undefined,
      returnPolicy: settings?.returnPolicy ?? undefined,
      showCashier: settings?.showCashierOnReceipt ?? true,
      showCustomer: settings?.showCustomerOnReceipt ?? true,
      showSku: settings?.showSkuOnReceipt ?? false,
      showBusinessEmail: settings?.showBusinessEmailOnReceipt ?? true,
      showBusinessPhone: settings?.showBusinessPhoneOnReceipt ?? true,
    },
    employee: order.employee ? { name: order.employee.name } : undefined,
    customer: customerName
      ? {
          name: customerName,
          email: order.customer?.email ?? undefined,
          phone: order.customer?.phone ?? undefined,
        }
      : undefined,
    lineItems: order.items.map((item) => ({
      name: item.name,
      sku: item.sku ?? undefined,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      discountAmount: Number(item.discountAmount),
      taxAmount: Number(item.taxAmount),
      total: Number(item.total),
    })),
    discounts: order.appliedDiscounts.map((d) => ({
      name: d.name,
      amount: Number(d.amount),
    })),
    subtotal: Number(order.subtotal),
    discountAmount: Number(order.discountAmount),
    taxAmount: Number(order.taxAmount),
    total: Number(order.total),
    payments: order.payments.map((p) => ({
      method: p.method,
      amount: Number(p.amount),
      status: p.status,
      cardBrand: p.cardBrand ?? undefined,
      cardLast4: p.cardLast4 ?? undefined,
      amountTendered: p.amountTendered ? Number(p.amountTendered) : undefined,
      changeDue: p.changeDue ? Number(p.changeDue) : undefined,
      stripePaymentIntentId: p.stripePaymentIntentId ?? undefined,
      createdAt: p.createdAt.toISOString(),
    })),
    refunds: order.refunds.map((r) => ({
      amount: Number(r.amount),
      taxAmount: Number(r.taxAmount),
      reason: r.reason,
      reasonNote: r.reasonNote ?? undefined,
      createdAt: r.createdAt.toISOString(),
      stripeRefundId: r.stripeRefundId ?? undefined,
    })),
    totalRefunded,
    netPaid,
    isRefunded: order.status === "REFUNDED",
    isPartiallyRefunded: order.status === "PARTIALLY_REFUNDED",
    emailedTo: receipt.emailedTo ?? undefined,
    lastEmailedAt: receipt.lastEmailedAt?.toISOString(),
    printed: receipt.printed,
    printedAt: receipt.printedAt?.toISOString(),
  };
}

export function formatPaymentMethodLabel(payment: ReceiptPaymentInfo): string {
  if (payment.method === "CARD" && payment.cardLast4) {
    const brand = payment.cardBrand
      ? payment.cardBrand.charAt(0).toUpperCase() + payment.cardBrand.slice(1)
      : "Card";
    return `${brand} •••• ${payment.cardLast4}`;
  }
  if (payment.method === "CASH") return "Cash";
  return payment.method.replace(/_/g, " ");
}

export function formatReceiptMoney(amount: number): string {
  return formatCurrency(amount);
}

export async function markReceiptPrinted(
  businessId: string,
  orderId: string
): Promise<void> {
  const receipt = await db.receipt.findFirst({
    where: { orderId, businessId },
  });
  if (!receipt) return;

  await db.receipt.update({
    where: { id: receipt.id },
    data: { printed: true, printedAt: new Date() },
  });
}

export async function markReceiptEmailed(
  businessId: string,
  orderId: string,
  emailedTo: string
): Promise<void> {
  const receipt = await db.receipt.findFirst({
    where: { orderId, businessId },
  });
  if (!receipt) return;

  await db.receipt.update({
    where: { id: receipt.id },
    data: {
      emailedTo,
      lastEmailedAt: new Date(),
    },
  });
}

export async function ensureReceiptForOrder(
  businessId: string,
  orderId: string
): Promise<void> {
  const existing = await db.receipt.findFirst({
    where: { orderId, businessId },
  });
  if (existing) return;

  const { createReceiptForOrder } = await import("@/lib/order-service");
  await createReceiptForOrder(businessId, orderId);
}
