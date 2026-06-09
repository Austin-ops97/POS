import { NextResponse } from "next/server";
import {
  createDemoOrder,
  demoAuthContext,
  demoCategories,
  demoCustomers,
  demoDashboardStats,
  demoEmployees,
  demoInventory,
  demoModules,
  demoOrders,
  demoProducts,
  demoSettings,
  demoStripeAccount,
  demoSubscription,
  demoTaxRates,
  DEMO_LOCATION_ID,
} from "./demo-data";
import { calculateOrderTotals } from "./order-calculator";

export function demoJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function getDemoBusiness() {
  return {
    ...demoAuthContext.business,
    settings: demoSettings,
    stripeAccount: demoStripeAccount,
    subscription: demoSubscription,
    locations: [demoAuthContext.location],
    defaultLocation: demoAuthContext.location,
    onboardingStep: "COMPLETED",
    onboardingComplete: true,
  };
}

export function getDemoProducts(search?: string, categoryId?: string) {
  let products = [...demoProducts];
  if (search) {
    const q = search.toLowerCase();
    products = products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.barcode?.includes(q)
    );
  }
  if (categoryId) {
    products = products.filter((p) => p.categoryId === categoryId);
  }
  return products;
}

export function handleDemoCheckout(body: {
  locationId?: string;
  items: { name: string; quantity: number; unitPrice: number; productId?: string }[];
  paymentMethod: "CARD" | "CASH";
  customerId?: string;
}) {
  const totals = calculateOrderTotals(
    body.items.map((i) => ({
      name: i.name,
      productId: i.productId,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      taxable: true,
    })),
    [],
    [{ name: "Sales Tax", rate: 0.0825, appliesToProducts: true, appliesToServices: true }]
  );

  const order = createDemoOrder({
    items: totals.items.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      total: i.total,
    })),
    subtotal: totals.subtotal,
    taxAmount: totals.taxAmount,
    total: totals.total,
    paymentMethod: body.paymentMethod,
    status: body.paymentMethod === "CARD" ? "PENDING_PAYMENT" : "PAID",
  });

  return {
    order,
    totals,
    paymentIntent: body.paymentMethod === "CARD"
      ? { id: `pi_demo_${order.orderNumber}`, clientSecret: `demo_secret_${order.id}`, status: "requires_payment_method" }
      : null,
  };
}

export function handleDemoCashPayment(orderId: string) {
  const order = demoOrders.find((o) => o.id === orderId);
  if (order) {
    order.status = "PAID";
    order.paidAt = new Date();
  }
  return { order, success: true };
}

export {
  demoCategories,
  demoCustomers,
  demoDashboardStats,
  demoEmployees,
  demoInventory,
  demoModules,
  demoOrders,
  demoProducts,
  demoSettings,
  demoStripeAccount,
  demoSubscription,
  demoTaxRates,
  DEMO_LOCATION_ID,
};
