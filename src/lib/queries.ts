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
import { isStripeConfigured, getStripeOrThrow } from "./stripe";

type DateRange = { start: Date; end: Date };

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function getDateRanges(): {
  today: DateRange;
  yesterday: DateRange;
  week: DateRange;
  month: DateRange;
} {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 6);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  return {
    today: { start: todayStart, end: todayEnd },
    yesterday: { start: startOfDay(yesterday), end: endOfDay(yesterday) },
    week: { start: startOfDay(weekStart), end: todayEnd },
    month: { start: startOfDay(monthStart), end: todayEnd },
  };
}

async function aggregateSales(
  businessId: string,
  locationId: string | undefined,
  range: DateRange
) {
  const orders = await db.order.findMany({
    where: {
      businessId,
      ...(locationId ? { locationId } : {}),
      paidAt: { gte: range.start, lte: range.end },
      status: { in: ["PAID", "PARTIALLY_REFUNDED"] },
    },
    include: {
      payments: { where: { status: "SUCCEEDED" } },
      refunds: { select: { amount: true } },
    },
  });

  let sales = 0;
  let cardSales = 0;
  let cashSales = 0;
  let refundTotal = 0;

  for (const order of orders) {
    sales += Number(order.total);
    refundTotal += order.refunds.reduce((s, r) => s + Number(r.amount), 0);
    for (const payment of order.payments) {
      const amount = Number(payment.amount);
      if (payment.method === "CARD") cardSales += amount;
      else if (payment.method === "CASH") cashSales += amount;
    }
  }

  return {
    sales,
    transactions: orders.length,
    aov: orders.length > 0 ? sales / orders.length : 0,
    cardSales,
    cashSales,
    refundTotal,
  };
}

async function getStripeBalanceSummary(businessId: string) {
  if (!isStripeConfigured()) {
    return {
      available: 0,
      pending: 0,
      upcomingDeposit: null as { amount: number; arrivalDate: string | null } | null,
      connected: false,
      status: "NOT_CONNECTED" as const,
    };
  }

  const stripeAccount = await db.stripeAccount.findUnique({
    where: { businessId },
  });

  if (!stripeAccount?.stripeAccountId) {
    return {
      available: 0,
      pending: 0,
      upcomingDeposit: null,
      connected: false,
      status: stripeAccount?.status ?? "NOT_CONNECTED",
    };
  }

  try {
    const stripe = getStripeOrThrow();
    const stripeOpts = { stripeAccount: stripeAccount.stripeAccountId };
    const [balance, payouts] = await Promise.all([
      stripe.balance.retrieve({}, stripeOpts),
      stripe.payouts.list({ limit: 5, status: "pending" }, stripeOpts),
    ]);

    const available =
      balance.available.find((b) => b.currency === "usd")?.amount ?? 0;
    const pending =
      balance.pending.find((b) => b.currency === "usd")?.amount ?? 0;

    const upcoming = payouts.data[0];

    return {
      available: available / 100,
      pending: pending / 100,
      upcomingDeposit: upcoming
        ? {
            amount: upcoming.amount / 100,
            arrivalDate: upcoming.arrival_date
              ? new Date(upcoming.arrival_date * 1000).toISOString()
              : null,
          }
        : null,
      connected: true,
      status: stripeAccount.status,
    };
  } catch {
    return {
      available: 0,
      pending: 0,
      upcomingDeposit: null,
      connected: true,
      status: stripeAccount.status,
    };
  }
}

export async function getDashboardData(ctx: AuthContext) {
  if (isDemoMode()) {
    return {
      stats: {
        ...demoDashboardStats,
        yesterdaySales: 312.5,
        weekSales: 1842.75,
        monthSales: 6240.0,
      },
      recentOrders: demoOrders.slice(0, 10),
      lowStock: demoDashboardStats.lowStock,
      topProducts: demoDashboardStats.topProducts,
      salesByDay: [
        { date: "Mon", sales: 45 },
        { date: "Tue", sales: 62 },
        { date: "Wed", sales: 58 },
        { date: "Thu", sales: 91 },
        { date: "Fri", sales: 90 },
        { date: "Sat", sales: 120 },
        { date: "Sun", sales: 75 },
      ],
      stripe: {
        available: 1240.5,
        pending: 380.25,
        upcomingDeposit: { amount: 380.25, arrivalDate: new Date().toISOString() },
        connected: true,
        status: "READY",
      },
    };
  }

  const businessId = ctx.business.id;
  const locationId = ctx.location?.id;
  const ranges = getDateRanges();

  const [
    today,
    yesterday,
    week,
    month,
    recentOrders,
    weekOrders,
    lowStockItems,
    stripe,
  ] = await Promise.all([
    aggregateSales(businessId, locationId, ranges.today),
    aggregateSales(businessId, locationId, ranges.yesterday),
    aggregateSales(businessId, locationId, ranges.week),
    aggregateSales(businessId, locationId, ranges.month),
    db.order.findMany({
      where: {
        businessId,
        ...(locationId ? { locationId } : {}),
        status: { in: ["PAID", "PARTIALLY_REFUNDED", "PENDING_PAYMENT", "HELD"] },
      },
      include: { payments: true, customer: true, employee: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    db.order.findMany({
      where: {
        businessId,
        ...(locationId ? { locationId } : {}),
        paidAt: { gte: ranges.week.start, lte: ranges.week.end },
        status: { in: ["PAID", "PARTIALLY_REFUNDED"] },
      },
      include: {
        items: { select: { name: true, quantity: true, total: true } },
      },
    }),
    db.inventoryItem.findMany({
      where: {
        businessId,
        ...(locationId ? { locationId } : {}),
        product: { trackInventory: true, isActive: true, deletedAt: null },
      },
      include: { product: { select: { name: true } } },
    }),
    getStripeBalanceSummary(businessId),
  ]);

  const productMap = new Map<string, { name: string; revenue: number; quantity: number }>();
  const dailyMap = new Map<string, { date: string; sales: number; orders: number }>();

  for (const order of weekOrders) {
    const orderTotal = Number(order.total);
    if (order.paidAt) {
      const dateKey = order.paidAt.toISOString().split("T")[0];
      const day = dailyMap.get(dateKey) || { date: dateKey, sales: 0, orders: 0 };
      day.sales += orderTotal;
      day.orders += 1;
      dailyMap.set(dateKey, day);
    }
    for (const item of order.items) {
      const existing = productMap.get(item.name) || {
        name: item.name,
        revenue: 0,
        quantity: 0,
      };
      existing.revenue += Number(item.total);
      existing.quantity += item.quantity;
      productMap.set(item.name, existing);
    }
  }

  const topProducts = Array.from(productMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const lowStock = lowStockItems
    .filter((item) => item.quantityOnHand <= item.reorderPoint)
    .sort((a, b) => a.quantityOnHand - b.quantityOnHand)
    .slice(0, 5);

  const salesByDay = Array.from(dailyMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  return {
    stats: {
      todaySales: today.sales,
      yesterdaySales: yesterday.sales,
      weekSales: week.sales,
      monthSales: month.sales,
      transactionCount: today.transactions,
      weekTransactions: week.transactions,
      aov: today.aov,
      refundTotal: today.refundTotal,
      cardSales: today.cardSales,
      cashSales: today.cashSales,
    },
    recentOrders,
    lowStock,
    topProducts,
    salesByDay,
    stripe,
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

export async function getReportsData(
  ctx: AuthContext,
  options?: { includeAdvanced?: boolean }
) {
  const includeAdvanced = options?.includeAdvanced ?? true;
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
      topProducts: includeAdvanced
        ? demoDashboardStats.topProducts.map((p) => ({
            name: p.name,
            revenue: p.revenue,
            quantity: p.quantity,
          }))
        : [],
      employeeSales: includeAdvanced
        ? [
            { name: "Chris Cashier", sales: 58.97, orders: 2 },
            { name: "Maria Manager", sales: 32.46, orders: 1 },
          ]
        : [],
      paymentMethods: includeAdvanced
        ? [
            { method: "Card", amount: 64.38 },
            { method: "Cash", amount: 27.05 },
          ]
        : [],
    };
  }

  const businessId = ctx.business.id;
  const start = new Date();
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const orders = await db.order.findMany({
    where: {
      businessId,
      status: { in: ["PAID", "PARTIALLY_REFUNDED"] },
      paidAt: { gte: start, lte: end },
    },
    include: {
      items: { select: { name: true, quantity: true, total: true } },
      employee: { select: { name: true } },
      payments: {
        where: { status: "SUCCEEDED" },
        select: { method: true, amount: true },
      },
    },
  });

  const dailyMap = new Map<string, { date: string; sales: number; orders: number }>();
  const productMap = new Map<string, { name: string; revenue: number; quantity: number }>();
  const employeeMap = new Map<string, { name: string; sales: number; orders: number }>();
  const paymentMap = new Map<string, number>();

  for (const order of orders) {
    const orderTotal = Number(order.total);
    if (order.paidAt) {
      const dateKey = order.paidAt.toISOString().split("T")[0];
      const day = dailyMap.get(dateKey) || { date: dateKey, sales: 0, orders: 0 };
      day.sales += orderTotal;
      day.orders += 1;
      dailyMap.set(dateKey, day);
    }

    const employeeName = order.employee?.name ?? "Unknown";
    const employeeStats = employeeMap.get(employeeName) || {
      name: employeeName,
      sales: 0,
      orders: 0,
    };
    employeeStats.sales += orderTotal;
    employeeStats.orders += 1;
    employeeMap.set(employeeName, employeeStats);

    for (const item of order.items) {
      const existing = productMap.get(item.name) || {
        name: item.name,
        revenue: 0,
        quantity: 0,
      };
      existing.revenue += Number(item.total);
      existing.quantity += item.quantity;
      productMap.set(item.name, existing);
    }

    for (const payment of order.payments) {
      const method =
        payment.method === "CARD"
          ? "Card"
          : payment.method === "CASH"
            ? "Cash"
            : payment.method;
      paymentMap.set(method, (paymentMap.get(method) ?? 0) + Number(payment.amount));
    }
  }

  return {
    salesByDay: Array.from(dailyMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    ),
    topProducts: includeAdvanced
      ? Array.from(productMap.values())
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 10)
      : [],
    employeeSales: includeAdvanced
      ? Array.from(employeeMap.values()).sort((a, b) => b.sales - a.sales)
      : [],
    paymentMethods: includeAdvanced
      ? Array.from(paymentMap.entries()).map(([method, amount]) => ({
          method,
          amount,
        }))
      : [],
  };
}
