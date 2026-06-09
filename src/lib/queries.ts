import { isDemoMode } from "./demo-mode";
import {
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
} from "./demo-data";
import { db } from "./db";
import type { AuthContext } from "./auth";

export async function getDashboardData(ctx: AuthContext) {
  if (isDemoMode()) {
    return {
      stats: demoDashboardStats,
      recentOrders: demoOrders.slice(0, 5),
      lowStock: demoDashboardStats.lowStock,
      topProducts: demoDashboardStats.topProducts,
      salesByHour: demoDashboardStats.salesByHour,
    };
  }

  const businessId = ctx.business.id;
  const locationId = ctx.location?.id;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const todayOrders = await db.order.findMany({
    where: {
      businessId,
      ...(locationId ? { locationId } : {}),
      paidAt: { gte: todayStart, lte: todayEnd },
      status: { in: ["PAID", "PARTIALLY_REFUNDED"] },
    },
    include: { payments: true, customer: true, employee: true, items: true },
    orderBy: { paidAt: "desc" },
    take: 10,
  });

  const todaySales = todayOrders.reduce((sum, o) => sum + Number(o.total), 0);
  const transactionCount = todayOrders.length;

  return {
    stats: {
      todaySales,
      transactionCount,
      aov: transactionCount > 0 ? todaySales / transactionCount : 0,
      refundTotal: 0,
      cardSales: 0,
      cashSales: 0,
      salesByHour: [],
      topProducts: [],
      lowStock: [],
    },
    recentOrders: todayOrders,
    lowStock: [],
    topProducts: [],
    salesByHour: [],
  };
}

export async function getProducts(ctx: AuthContext) {
  if (isDemoMode()) return demoProducts;
  return db.product.findMany({
    where: { businessId: ctx.business.id, deletedAt: null },
    include: { category: true },
    orderBy: { name: "asc" },
  });
}

export async function getCategories(ctx: AuthContext) {
  if (isDemoMode()) return demoCategories;
  return db.category.findMany({
    where: { businessId: ctx.business.id, deletedAt: null },
    orderBy: { name: "asc" },
  });
}

export async function getOrders(ctx: AuthContext) {
  if (isDemoMode()) return demoOrders;
  return db.order.findMany({
    where: { businessId: ctx.business.id },
    include: { customer: true, employee: true, payments: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function getOrderById(ctx: AuthContext, id: string) {
  if (isDemoMode()) return demoOrders.find((o) => o.id === id) ?? null;
  return db.order.findFirst({
    where: { id, businessId: ctx.business.id },
    include: {
      items: true,
      customer: true,
      employee: true,
      payments: true,
      refunds: { include: { items: true } },
    },
  });
}

export async function getCustomers(ctx: AuthContext) {
  if (isDemoMode()) return demoCustomers;
  return db.customer.findMany({
    where: { businessId: ctx.business.id, deletedAt: null },
    orderBy: { firstName: "asc" },
  });
}

export async function getCustomerById(ctx: AuthContext, id: string) {
  if (isDemoMode()) {
    const customer = demoCustomers.find((c) => c.id === id);
    if (!customer) return null;
    const orders = demoOrders.filter((o) => o.customerId === id);
    const totalSpent = orders.reduce((s, o) => s + o.total, 0);
    return { ...customer, orders, totalSpent, orderCount: orders.length };
  }
  const customer = await db.customer.findFirst({
    where: { id, businessId: ctx.business.id },
  });
  if (!customer) return null;
  const orders = await db.order.findMany({
    where: { customerId: id, businessId: ctx.business.id },
    orderBy: { createdAt: "desc" },
  });
  const totalSpent = orders.reduce((s, o) => s + Number(o.total), 0);
  return { ...customer, orders, totalSpent, orderCount: orders.length };
}

export async function getInventory(ctx: AuthContext) {
  if (isDemoMode()) return demoInventory;
  return db.inventoryItem.findMany({
    where: { businessId: ctx.business.id },
    include: { product: { include: { category: true } }, location: true },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getEmployees(ctx: AuthContext) {
  if (isDemoMode()) return demoEmployees;
  return db.employeeProfile.findMany({
    where: { businessId: ctx.business.id, deletedAt: null },
    include: { role: true },
    orderBy: { name: "asc" },
  });
}

export async function getStripeSettings(ctx: AuthContext) {
  if (isDemoMode()) {
    return { stripeAccount: demoStripeAccount, subscription: demoSubscription };
  }
  const [stripeAccount, subscription] = await Promise.all([
    db.stripeAccount.findUnique({ where: { businessId: ctx.business.id } }),
    db.subscription.findUnique({ where: { businessId: ctx.business.id } }),
  ]);
  return { stripeAccount, subscription };
}

export async function getTaxRates(ctx: AuthContext) {
  if (isDemoMode()) return demoTaxRates;
  return db.taxRate.findMany({ where: { businessId: ctx.business.id } });
}

export async function getModuleSettings(ctx: AuthContext) {
  if (isDemoMode()) return demoModules;
  return db.moduleSetting.findMany({ where: { businessId: ctx.business.id } });
}

export async function getBusinessSettings(ctx: AuthContext) {
  if (isDemoMode()) return demoSettings;
  return db.businessSetting.findUnique({ where: { businessId: ctx.business.id } });
}

export async function getReportsData(ctx: AuthContext) {
  if (isDemoMode()) {
    return {
      salesByDay: [
        { date: "Mon", sales: 45, orders: 2 },
        { date: "Tue", sales: 62, orders: 3 },
        { date: "Wed", sales: 58, orders: 2 },
        { date: "Thu", sales: 91, orders: 4 },
        { date: "Fri", sales: 90, orders: 3 },
        { date: "Sat", sales: 120, orders: 5 },
        { date: "Sun", sales: 75, orders: 3 },
      ],
      topProducts: demoDashboardStats.topProducts.map((p) => ({
        name: p.name,
        revenue: p.revenue,
        quantity: p.quantity,
      })),
      employeeSales: [
        { name: "Chris Cashier", sales: 58.97, orders: 2 },
        { name: "Maria Manager", sales: 32.46, orders: 1 },
      ],
      paymentMethods: [
        { method: "Card", amount: 64.38 },
        { method: "Cash", amount: 27.05 },
      ],
    };
  }
  return {
    salesByDay: [],
    topProducts: [],
    employeeSales: [],
    paymentMethods: [],
  };
}
