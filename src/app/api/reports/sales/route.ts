import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-utils";
import { requireAuth, hasPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();

    if (!hasPermission(ctx, PERMISSIONS.VIEW_REPORTS)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = request.nextUrl;
    const scope = searchParams.get("scope") ?? "basic";

    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const locationId = searchParams.get("locationId");

    const start = startDate ? new Date(startDate) : new Date();
    start.setHours(0, 0, 0, 0);

    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json(
        { error: "Invalid date format. Use ISO date strings." },
        { status: 400 }
      );
    }

    const orderWhere = {
      businessId: ctx.business.id,
      status: { in: ["PAID" as const, "PARTIALLY_REFUNDED" as const] },
      paidAt: { gte: start, lte: end },
      ...(locationId ? { locationId } : {}),
    };

    const orders = await db.order.findMany({
      where: orderWhere,
      select: {
        id: true,
        total: true,
        subtotal: true,
        taxAmount: true,
        discountAmount: true,
        paidAt: true,
        payments: {
          where: { status: "SUCCEEDED" },
          select: { method: true, amount: true },
        },
        refunds: {
          select: { amount: true },
        },
        ...(scope === "advanced"
          ? {
              items: { select: { name: true, quantity: true, total: true } },
              employee: { select: { name: true } },
            }
          : {}),
      },
    });

    let grossSales = 0;
    let subtotal = 0;
    let taxCollected = 0;
    let discounts = 0;
    let cashSales = 0;
    let cardSales = 0;
    let otherSales = 0;
    let refundsTotal = 0;

    const dailyMap = new Map<string, { date: string; sales: number; orders: number }>();
    const productMap = new Map<string, { name: string; revenue: number; quantity: number }>();
    const employeeMap = new Map<string, { name: string; sales: number; orders: number }>();
    const paymentMap = new Map<string, number>();

    for (const order of orders) {
      const orderTotal = Number(order.total);
      const orderSubtotal = Number(order.subtotal);
      const orderTax = Number(order.taxAmount);
      const orderDiscount = Number(order.discountAmount);
      const orderRefunds = order.refunds.reduce(
        (sum, r) => sum + Number(r.amount),
        0
      );

      grossSales += orderTotal;
      subtotal += orderSubtotal;
      taxCollected += orderTax;
      discounts += orderDiscount;
      refundsTotal += orderRefunds;

      for (const payment of order.payments) {
        const amount = Number(payment.amount);
        if (payment.method === "CASH") cashSales += amount;
        else if (payment.method === "CARD") cardSales += amount;
        else otherSales += amount;
      }

      if (order.paidAt) {
        const dateKey = order.paidAt.toISOString().split("T")[0];
        const existing = dailyMap.get(dateKey) || {
          date: dateKey,
          sales: 0,
          orders: 0,
        };
        existing.sales += orderTotal;
        existing.orders += 1;
        dailyMap.set(dateKey, existing);
      }

      if (scope === "advanced" && "items" in order && "employee" in order) {
        const advancedOrder = order as typeof order & {
          items: Array<{ name: string; quantity: number; total: unknown }>;
          employee: { name: string } | null;
        };

        const employeeName = advancedOrder.employee?.name ?? "Unknown";
        const employeeStats = employeeMap.get(employeeName) || {
          name: employeeName,
          sales: 0,
          orders: 0,
        };
        employeeStats.sales += orderTotal;
        employeeStats.orders += 1;
        employeeMap.set(employeeName, employeeStats);

        for (const item of advancedOrder.items) {
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
          paymentMap.set(
            method,
            (paymentMap.get(method) ?? 0) + Number(payment.amount)
          );
        }
      }
    }

    const orderCount = orders.length;
    const netSales = grossSales - refundsTotal;
    const avgOrderValue = orderCount > 0 ? grossSales / orderCount : 0;

    const dailyBreakdown = Array.from(dailyMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    const response: Record<string, unknown> = {
      summary: {
        grossSales: round2(grossSales),
        netSales: round2(netSales),
        subtotal: round2(subtotal),
        taxCollected: round2(taxCollected),
        discounts: round2(discounts),
        refunds: round2(refundsTotal),
        orderCount,
        avgOrderValue: round2(avgOrderValue),
        cashSales: round2(cashSales),
        cardSales: round2(cardSales),
        otherSales: round2(otherSales),
      },
      dailyBreakdown,
      filters: {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        locationId: locationId || null,
        scope,
      },
    };

    if (scope === "advanced") {
      response.topProducts = Array.from(productMap.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);
      response.employeeSales = Array.from(employeeMap.values()).sort(
        (a, b) => b.sales - a.sales
      );
      response.paymentMethods = Array.from(paymentMap.entries()).map(
        ([method, amount]) => ({ method, amount: round2(amount) })
      );
    }

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return handleApiError(error, "GET /api/reports/sales");
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
