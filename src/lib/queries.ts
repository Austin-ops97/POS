import { Prisma } from "@prisma/client";
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
  const orderWhere = {
    businessId,
    ...(locationId ? { locationId } : {}),
    paidAt: { gte: range.start, lte: range.end },
    status: { in: ["PAID" as const, "PARTIALLY_REFUNDED" as const] },
  };

  const [orderAgg, paymentGroups, refundAgg] = await Promise.all([
    db.order.aggregate({
      where: orderWhere,
      _sum: { total: true },
      _count: true,
    }),
    db.payment.groupBy({
      by: ["method"],
      where: {
        businessId,
        status: "SUCCEEDED",
        order: orderWhere,
      },
      _sum: { amount: true },
    }),
    db.refund.aggregate({
      where: {
        businessId,
        order: orderWhere,
      },
      _sum: { amount: true },
    }),
  ]);

  const sales = Number(orderAgg._sum.total ?? 0);
  const transactions = orderAgg._count;
  let cardSales = 0;
  let cashSales = 0;
  for (const row of paymentGroups) {
    const amount = Number(row._sum.amount ?? 0);
    if (row.method === "CARD") cardSales += amount;
    else if (row.method === "CASH") cashSales += amount;
  }

  return {
    sales,
    transactions,
    aov: transactions > 0 ? sales / transactions : 0,
    cardSales,
    cashSales,
    refundTotal: Number(refundAgg._sum.amount ?? 0),
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
    productCount,
    paidSaleCount,
    employeeCount,
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
    (async () => {
      const lowIds = await db.$queryRaw<{ id: string }[]>`
        SELECT i.id
        FROM "InventoryItem" i
        INNER JOIN "Product" p ON p.id = i."productId"
        WHERE i."businessId" = ${businessId}
          ${locationId ? Prisma.sql`AND i."locationId" = ${locationId}` : Prisma.empty}
          AND p."trackInventory" = true
          AND p."isActive" = true
          AND p."deletedAt" IS NULL
          AND i."quantityOnHand" <= i."reorderPoint"
        ORDER BY i."quantityOnHand" ASC
        LIMIT 5
      `;
      if (lowIds.length === 0) return [];
      const items = await db.inventoryItem.findMany({
        where: { id: { in: lowIds.map((r) => r.id) } },
        include: { product: { select: { name: true } } },
      });
      const order = new Map(lowIds.map((r, idx) => [r.id, idx]));
      return items.sort(
        (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
      );
    })(),
    getStripeBalanceSummary(businessId),
    db.product.count({
      where: { businessId, deletedAt: null, isActive: true },
    }),
    db.order.count({
      where: {
        businessId,
        status: { in: ["PAID", "PARTIALLY_REFUNDED"] },
      },
    }),
    db.employeeProfile.count({
      where: { businessId, deletedAt: null, status: "ACTIVE" },
    }),
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

  const lowStock = lowStockItems;

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
    setup: {
      hasCustomBusinessName:
        Boolean(ctx.business.name) &&
        ctx.business.name.trim().toLowerCase() !== "my business",
      hasProducts: productCount > 0,
      stripeConnected: Boolean(stripe.connected),
      hasPaidSale: paidSaleCount > 0,
    },
    employeeCount,
  };
}

export async function getProducts(ctx: AuthContext) {
  return db.product.findMany({
    where: { businessId: ctx.business.id, deletedAt: null },
    include: { category: true },
    orderBy: { name: "asc" },
  });
}

export async function getCategories(ctx: AuthContext) {
  return db.category.findMany({
    where: { businessId: ctx.business.id, deletedAt: null },
    orderBy: { name: "asc" },
  });
}

export async function getOrders(ctx: AuthContext) {
  return db.order.findMany({
    where: { businessId: ctx.business.id },
    include: { customer: true, employee: true, payments: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function getOrderById(ctx: AuthContext, id: string) {
  return db.order.findFirst({
    where: { id, businessId: ctx.business.id },
    include: {
      items: true,
      customer: true,
      employee: true,
      location: true,
      payments: true,
      receipts: { orderBy: { createdAt: "desc" } },
      refunds: { include: { items: true } },
    },
  });
}

export async function getCustomers(ctx: AuthContext) {
  return db.customer.findMany({
    where: { businessId: ctx.business.id, deletedAt: null },
    orderBy: { firstName: "asc" },
  });
}

export async function getCustomerById(ctx: AuthContext, id: string) {
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
  return db.inventoryItem.findMany({
    where: { businessId: ctx.business.id },
    include: { product: { include: { category: true } }, location: true },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getEmployees(ctx: AuthContext) {
  return db.employeeProfile.findMany({
    where: { businessId: ctx.business.id, deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      status: true,
      hourlyWage: true,
      ptoBalanceHours: true,
      ptoAnnualHours: true,
      role: { select: { id: true, name: true } },
      createdAt: true,
    },
    orderBy: { name: "asc" },
  });
}

export async function getStripeSettings(ctx: AuthContext) {
  const stripeAccount = await db.stripeAccount.findUnique({
    where: { businessId: ctx.business.id },
  });
  return { stripeAccount };
}

export async function getTaxRates(ctx: AuthContext) {
  return db.taxRate.findMany({ where: { businessId: ctx.business.id } });
}

export async function getModuleSettings(ctx: AuthContext) {
  return db.moduleSetting.findMany({ where: { businessId: ctx.business.id } });
}

export async function getBusinessSettings(ctx: AuthContext) {
  return db.businessSetting.findUnique({ where: { businessId: ctx.business.id } });
}

export async function getReportsData(ctx: AuthContext) {
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
    topProducts: Array.from(productMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10),
    employeeSales: Array.from(employeeMap.values()).sort((a, b) => b.sales - a.sales),
    paymentMethods: Array.from(paymentMap.entries()).map(([method, amount]) => ({
      method,
      amount,
    })),
  };
}

export async function getEmployeeById(ctx: AuthContext, id: string) {
  return db.employeeProfile.findFirst({
    where: { id, businessId: ctx.business.id, deletedAt: null },
    include: {
      role: { select: { id: true, name: true } },
      locations: { include: { location: { select: { id: true, name: true } } } },
    },
  });
}

export async function getWorkforceOverview(ctx: AuthContext) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const [clockedIn, todayShifts, pendingTimeOff, activeEmployees] = await Promise.all([
    db.timeEntry.findMany({
      where: {
        businessId: ctx.business.id,
        status: "ACTIVE",
      },
      include: {
        employee: { select: { id: true, name: true } },
        breaks: true,
      },
    }),
    db.shift.findMany({
      where: {
        businessId: ctx.business.id,
        status: "SCHEDULED",
        startAt: { gte: todayStart, lte: todayEnd },
      },
      include: {
        employee: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
      },
      orderBy: { startAt: "asc" },
    }),
    db.timeOffRequest.findMany({
      where: {
        businessId: ctx.business.id,
        status: "PENDING",
      },
      include: {
        employee: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    db.employeeProfile.count({
      where: { businessId: ctx.business.id, deletedAt: null, status: "ACTIVE" },
    }),
  ]);

  return { clockedIn, todayShifts, pendingTimeOff, activeEmployees };
}

export async function getEmployeeWorkforceSummary(ctx: AuthContext, employeeId: string) {
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const [timeEntries, upcomingShifts, activeEntry] = await Promise.all([
    db.timeEntry.findMany({
      where: {
        businessId: ctx.business.id,
        employeeId,
        clockIn: { gte: weekStart },
      },
      include: { breaks: true },
      orderBy: { clockIn: "desc" },
      take: 10,
    }),
    db.shift.findMany({
      where: {
        businessId: ctx.business.id,
        employeeId,
        status: "SCHEDULED",
        startAt: { gte: new Date() },
      },
      orderBy: { startAt: "asc" },
      take: 5,
    }),
    db.timeEntry.findFirst({
      where: { employeeId, status: "ACTIVE" },
      include: { breaks: true },
    }),
  ]);

  return { timeEntries, upcomingShifts, activeEntry };
}
