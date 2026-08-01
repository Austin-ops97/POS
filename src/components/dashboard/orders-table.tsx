"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Ban, ClipboardList } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/dashboard/empty-state";
import {
  TerminateOrderDialog,
  type TerminateOrderDialogOrder,
} from "@/components/dashboard/terminate-order-dialog";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  formatOrderStatus,
  getOrderStatusVariant,
} from "@/lib/status-utils";
import { canTerminateOrder } from "@/lib/orders/terminate-order-helpers";
import type { OrderStatus } from "@prisma/client";

export type OrderRow = {
  id: string;
  orderNumber: string;
  customerName: string | null;
  total: number;
  status: OrderStatus;
  createdAt: string;
  employeeName?: string | null;
  canTerminate?: boolean;
};

type OrdersTableProps = {
  orders: OrderRow[];
  canTerminateOrders?: boolean;
};

const ACTIVE_PENDING_STATUSES = new Set<OrderStatus>([
  "HELD",
  "DRAFT",
  "PENDING_PAYMENT",
  "FAILED",
]);

type StatusFilter =
  | "all"
  | "active_pending"
  | "terminated"
  | OrderStatus;

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "active_pending", label: "Active pending" },
  { value: "all", label: "All statuses" },
  { value: "PAID", label: formatOrderStatus("PAID") },
  { value: "PENDING_PAYMENT", label: formatOrderStatus("PENDING_PAYMENT") },
  { value: "HELD", label: formatOrderStatus("HELD") },
  { value: "DRAFT", label: formatOrderStatus("DRAFT") },
  { value: "FAILED", label: formatOrderStatus("FAILED") },
  { value: "PARTIALLY_REFUNDED", label: formatOrderStatus("PARTIALLY_REFUNDED") },
  { value: "REFUNDED", label: formatOrderStatus("REFUNDED") },
  { value: "terminated", label: "Terminated" },
  { value: "CANCELED", label: formatOrderStatus("CANCELED") },
];

function rowCanTerminate(order: OrderRow, canTerminateOrders: boolean): boolean {
  if (order.canTerminate != null) return order.canTerminate;
  return canTerminateOrders && canTerminateOrder(order.status);
}

export function OrdersTable({
  orders: initialOrders,
  canTerminateOrders = false,
}: OrdersTableProps) {
  const [orders, setOrders] = useState(initialOrders);
  const [status, setStatus] = useState<StatusFilter>("active_pending");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [terminating, setTerminating] = useState<TerminateOrderDialogOrder | null>(
    null
  );

  const filtered = useMemo(() => {
    return orders.filter((order) => {
      let matchesStatus = true;
      if (status === "active_pending") {
        matchesStatus = ACTIVE_PENDING_STATUSES.has(order.status);
      } else if (status === "terminated") {
        matchesStatus = order.status === "CANCELED";
      } else if (status !== "all") {
        matchesStatus = order.status === status;
      }

      const orderDate = new Date(order.createdAt);
      const matchesFrom = !dateFrom || orderDate >= new Date(dateFrom);
      const matchesTo =
        !dateTo || orderDate <= new Date(dateTo + "T23:59:59");
      return matchesStatus && matchesFrom && matchesTo;
    });
  }, [orders, status, dateFrom, dateTo]);

  function handleTerminated(result: { id: string; status: string }) {
    setOrders((prev) =>
      prev.map((order) =>
        order.id === result.id
          ? {
              ...order,
              status: result.status as OrderStatus,
              canTerminate: false,
            }
          : order
      )
    );
    setTerminating(null);
  }

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
        <Select
          value={status}
          onValueChange={(v) => setStatus(v as StatusFilter)}
        >
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
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
            {filtered.map((order) => {
              const showTerminate = rowCanTerminate(order, canTerminateOrders);
              return (
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
                        {order.employeeName ? ` · ${order.employeeName}` : ""}
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
                    <div className="flex shrink-0 items-center gap-3">
                      {showTerminate && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setTerminating({
                              id: order.id,
                              orderNumber: order.orderNumber,
                              customerName: order.customerName,
                              total: order.total,
                              createdAt: order.createdAt,
                              employeeName: order.employeeName,
                            })
                          }
                        >
                          <Ban className="h-3.5 w-3.5" />
                          Terminate
                        </Button>
                      )}
                      <Link
                        href={`/orders/${order.id}`}
                        className="text-sm font-medium text-slate-900 underline-offset-2 hover:underline"
                      >
                        View
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Order</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Customer</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Employee</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Date</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Total</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
                  {canTerminateOrders && (
                    <th className="px-4 py-3 text-right font-medium text-slate-600">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map((order) => {
                  const showTerminate = rowCanTerminate(order, canTerminateOrders);
                  return (
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
                      <td className="max-w-[10rem] truncate px-4 py-3 text-slate-600">
                        {order.employeeName || "—"}
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
                      {canTerminateOrders && (
                        <td className="px-4 py-3 text-right">
                          {showTerminate ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setTerminating({
                                  id: order.id,
                                  orderNumber: order.orderNumber,
                                  customerName: order.customerName,
                                  total: order.total,
                                  createdAt: order.createdAt,
                                  employeeName: order.employeeName,
                                })
                              }
                            >
                              <Ban className="h-3.5 w-3.5" />
                              Terminate
                            </Button>
                          ) : null}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {terminating && (
        <TerminateOrderDialog
          order={terminating}
          open={Boolean(terminating)}
          onOpenChange={(open) => {
            if (!open) setTerminating(null);
          }}
          onTerminated={handleTerminated}
        />
      )}
    </div>
  );
}
