"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/dashboard/empty-state";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  formatOrderStatus,
  getOrderStatusVariant,
} from "@/lib/status-utils";
import type { OrderStatus } from "@prisma/client";

export type OrderRow = {
  id: string;
  orderNumber: string;
  customerName: string | null;
  total: number;
  status: OrderStatus;
  createdAt: string;
};

type OrdersTableProps = {
  orders: OrderRow[];
};

const STATUS_OPTIONS: Array<OrderStatus | "all"> = [
  "all",
  "PAID",
  "PENDING_PAYMENT",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
  "CANCELED",
  "HELD",
  "DRAFT",
];

export function OrdersTable({ orders }: OrdersTableProps) {
  const [status, setStatus] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filtered = useMemo(() => {
    return orders.filter((order) => {
      const matchesStatus = status === "all" || order.status === status;
      const orderDate = new Date(order.createdAt);
      const matchesFrom = !dateFrom || orderDate >= new Date(dateFrom);
      const matchesTo =
        !dateTo || orderDate <= new Date(dateTo + "T23:59:59");
      return matchesStatus && matchesFrom && matchesTo;
    });
  }, [orders, status, dateFrom, dateTo]);

  if (orders.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No orders yet"
        description="Orders will appear here once you start selling."
        actionLabel="Open Register"
        actionHref="/register"
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {s === "all" ? "All statuses" : formatOrderStatus(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="w-full sm:w-[160px]"
          placeholder="From"
          aria-label="From date"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="w-full sm:w-[160px]"
          placeholder="To"
          aria-label="To date"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-slate-500">
          No orders match your filters.
        </p>
      ) : (
        <>
          <ul className="space-y-3 md:hidden">
            {filtered.map((order) => (
              <li
                key={order.id}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/orders/${order.id}`}
                      className="block truncate font-semibold text-slate-900 hover:underline"
                    >
                      {order.orderNumber}
                    </Link>
                    <p className="mt-0.5 truncate text-sm text-slate-500">
                      {order.customerName || "Walk-in"}
                    </p>
                  </div>
                  <Badge variant={getOrderStatusVariant(order.status)}>
                    {formatOrderStatus(order.status)}
                  </Badge>
                </div>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-slate-900">
                      {formatCurrency(order.total)}
                    </p>
                    <p className="text-sm text-slate-500">
                      {formatDate(order.createdAt)}
                    </p>
                  </div>
                  <Link
                    href={`/orders/${order.id}`}
                    className="shrink-0 text-sm font-medium text-slate-900 underline-offset-2 hover:underline"
                  >
                    View
                  </Link>
                </div>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Order</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Customer</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Date</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Total</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((order) => (
                  <tr key={order.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/orders/${order.id}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {order.orderNumber}
                      </Link>
                    </td>
                    <td className="max-w-[12rem] truncate px-4 py-3 text-slate-600">
                      {order.customerName || "Walk-in"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatDate(order.createdAt)}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {formatCurrency(order.total)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={getOrderStatusVariant(order.status)}>
                        {formatOrderStatus(order.status)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
