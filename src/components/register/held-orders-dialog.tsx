"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency, formatDate } from "@/lib/utils";

export type HeldOrderSummary = {
  id: string;
  orderNumber: string;
  total: number;
  itemCount?: number;
  heldAt?: string | null;
  createdAt?: string;
  customer?: {
    id: string;
    firstName: string;
    lastName?: string | null;
  } | null;
};

type HeldOrdersDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (order: HeldOrderSummary) => void;
};

export function HeldOrdersDialog({
  open,
  onOpenChange,
  onSelect,
}: HeldOrdersDialogProps) {
  const [orders, setOrders] = useState<HeldOrderSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/orders?status=HELD&limit=20");
        if (!res.ok) throw new Error("Failed to load held orders");
        const data = await res.json();
        if (!cancelled) {
          setOrders(data.orders || []);
        }
      } catch {
        if (!cancelled) {
          setError("Failed to load held orders");
          setOrders([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resume held order</DialogTitle>
          <DialogDescription>
            Choose a held order to load into the register.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        <ul className="max-h-80 space-y-2 overflow-y-auto" role="listbox" aria-label="Held orders">
          {loading ? (
            <li className="py-8 text-center text-sm text-slate-500">Loading…</li>
          ) : orders.length === 0 ? (
            <li className="py-8 text-center text-sm text-slate-500">
              No held orders
            </li>
          ) : (
            orders.map((order) => {
              const customerName = order.customer
                ? `${order.customer.firstName}${
                    order.customer.lastName ? ` ${order.customer.lastName}` : ""
                  }`
                : "Walk-in";
              const when = order.heldAt || order.createdAt;
              return (
                <li key={order.id}>
                  <button
                    type="button"
                    role="option"
                    className="flex w-full items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:border-slate-300 hover:bg-slate-50"
                    onClick={() => {
                      onSelect(order);
                      onOpenChange(false);
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block font-semibold text-slate-900">
                        {order.orderNumber}
                      </span>
                      <span className="mt-0.5 block text-sm text-slate-600">
                        {customerName}
                        {order.itemCount != null
                          ? ` · ${order.itemCount} item${order.itemCount === 1 ? "" : "s"}`
                          : ""}
                      </span>
                      {when ? (
                        <span className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          {formatDate(when)}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-base font-bold text-slate-900">
                      {formatCurrency(Number(order.total))}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
