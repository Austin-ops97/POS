"use client";

import {
  Minus,
  Plus,
  Trash2,
  User,
  Percent,
  Pause,
  RotateCcw,
  PlusCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn, formatCurrency } from "@/lib/utils";
import { useCartStore } from "@/stores/cart-store";
import { calculateOrderTotals } from "@/lib/order-calculator";

type CartPanelProps = {
  dark?: boolean;
  taxRate?: number;
  onPayCash: () => void;
  onPayCard: () => void;
  onHold: () => void;
  onResumeHeld?: () => void;
  onClear: () => void;
  onAddCustom: () => void;
  onSelectCustomer: () => void;
  onAddDiscount: () => void;
  disabled?: boolean;
  className?: string;
};

export function CartPanel({
  dark = true,
  taxRate = 0,
  onPayCash,
  onPayCard,
  onHold,
  onResumeHeld,
  onClear,
  onAddCustom,
  onSelectCustomer,
  onAddDiscount,
  disabled,
  className,
}: CartPanelProps) {
  const {
    items,
    discounts,
    customerName,
    removeItem,
    updateQuantity,
    removeDiscount,
  } = useCartStore();

  const totals = calculateOrderTotals(
    items.map((i) => ({
      productId: i.productId,
      variantId: i.variantId,
      name: i.name,
      sku: i.sku,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      taxable: i.taxable,
      modifiers: i.modifiers,
    })),
    discounts.map((d) => ({
      name: d.name,
      type: d.type,
      value: d.value,
    })),
    [{ name: "Sales Tax", rate: taxRate, appliesToProducts: true, appliesToServices: true }]
  );

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        dark ? "bg-slate-900 text-white" : "bg-white text-slate-900 border-l border-slate-200",
        className
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between border-b px-5 py-4",
          dark ? "border-slate-700" : "border-slate-200"
        )}
      >
        <div>
          <h2 className="text-lg font-semibold">Current Sale</h2>
          <p className={cn("text-sm", dark ? "text-slate-400" : "text-slate-500")}>
            {itemCount} {itemCount === 1 ? "item" : "items"}
          </p>
        </div>
        <div className="flex gap-2">
          {onResumeHeld && (
            <Button
              variant={dark ? "secondary" : "outline"}
              size="sm"
              onClick={onResumeHeld}
              disabled={disabled}
              className="h-10"
            >
              <RotateCcw className="mr-1.5 h-4 w-4" />
              Resume
            </Button>
          )}
          <Button
            variant={dark ? "secondary" : "outline"}
            size="sm"
            onClick={onHold}
            disabled={disabled || items.length === 0}
            className="h-10"
          >
            <Pause className="mr-1.5 h-4 w-4" />
            Hold
          </Button>
          <Button
            variant={dark ? "secondary" : "outline"}
            size="sm"
            onClick={onClear}
            disabled={disabled || items.length === 0}
            className="h-10"
          >
            <RotateCcw className="mr-1.5 h-4 w-4" />
            Clear
          </Button>
        </div>
      </div>

      <button
        type="button"
        onClick={onSelectCustomer}
        className={cn(
          "flex items-center gap-3 border-b px-5 py-4 text-left transition-colors",
          dark
            ? "border-slate-700 hover:bg-slate-800"
            : "border-slate-200 hover:bg-slate-50"
        )}
      >
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full",
            dark ? "bg-slate-700" : "bg-slate-100"
          )}
        >
          <User className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-medium">
            {customerName || "Walk-in Customer"}
          </p>
          <p className={cn("text-xs", dark ? "text-slate-400" : "text-slate-500")}>
            Tap to select customer
          </p>
        </div>
      </button>

      <div className="flex-1 overflow-y-auto px-5 py-3">
        {items.length === 0 ? (
          <div
            className={cn(
              "flex h-full flex-col items-center justify-center text-center",
              dark ? "text-slate-500" : "text-slate-400"
            )}
          >
            <p className="text-sm font-medium">Cart is empty</p>
            <p className="mt-1 text-xs">Add products to begin checkout</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <li
                key={item.id}
                className={cn(
                  "rounded-xl p-3",
                  dark ? "bg-slate-800" : "bg-slate-50"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{item.name}</p>
                    {item.sku && (
                      <p
                        className={cn(
                          "text-xs",
                          dark ? "text-slate-400" : "text-slate-500"
                        )}
                      >
                        {item.sku}
                      </p>
                    )}
                    <p
                      className={cn(
                        "mt-1 text-sm",
                        dark ? "text-slate-300" : "text-slate-600"
                      )}
                    >
                      {formatCurrency(item.unitPrice)} each
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className={cn(
                      "rounded-lg p-1.5 transition-colors",
                      dark
                        ? "text-slate-400 hover:bg-slate-700 hover:text-red-400"
                        : "text-slate-400 hover:bg-slate-200 hover:text-red-600"
                    )}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Button
                      variant={dark ? "secondary" : "outline"}
                      size="icon"
                      className="h-10 w-10 rounded-lg"
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <Input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) =>
                        updateQuantity(item.id, parseInt(e.target.value) || 1)
                      }
                      className={cn(
                        "h-10 w-14 text-center text-base font-semibold",
                        dark && "border-slate-600 bg-slate-700 text-white"
                      )}
                    />
                    <Button
                      variant={dark ? "secondary" : "outline"}
                      size="icon"
                      className="h-10 w-10 rounded-lg"
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-lg font-bold">
                    {formatCurrency(item.unitPrice * item.quantity)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div
        className={cn(
          "border-t px-5 py-4",
          dark ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"
        )}
      >
        <div className="mb-3 flex gap-2">
          <Button
            variant={dark ? "secondary" : "outline"}
            size="sm"
            className="h-10 flex-1"
            onClick={onAddCustom}
            disabled={disabled}
          >
            <PlusCircle className="mr-1.5 h-4 w-4" />
            Custom Item
          </Button>
          <Button
            variant={dark ? "secondary" : "outline"}
            size="sm"
            className="h-10 flex-1"
            onClick={onAddDiscount}
            disabled={disabled || items.length === 0}
          >
            <Percent className="mr-1.5 h-4 w-4" />
            Discount
          </Button>
        </div>

        {discounts.length > 0 && (
          <div className="mb-3 space-y-1">
            {discounts.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between text-sm"
              >
                <button
                  type="button"
                  onClick={() => removeDiscount(d.id)}
                  className={cn(
                    "hover:underline",
                    dark ? "text-emerald-400" : "text-emerald-600"
                  )}
                >
                  {d.name} (−)
                </button>
                <span className={dark ? "text-emerald-400" : "text-emerald-600"}>
                  −
                  {d.type === "PERCENTAGE"
                    ? `${d.value}%`
                    : formatCurrency(d.value)}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className={dark ? "text-slate-400" : "text-slate-500"}>
              Subtotal
            </span>
            <span>{formatCurrency(totals.subtotal)}</span>
          </div>
          {totals.discountAmount > 0 && (
            <div className="flex justify-between">
              <span className={dark ? "text-slate-400" : "text-slate-500"}>
                Discount
              </span>
              <span className="text-emerald-400">
                −{formatCurrency(totals.discountAmount)}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className={dark ? "text-slate-400" : "text-slate-500"}>
              Tax
            </span>
            <span>{formatCurrency(totals.taxAmount)}</span>
          </div>
          <Separator className={dark ? "bg-slate-700" : ""} />
          <div className="flex justify-between text-xl font-bold">
            <span>Total</span>
            <span>{formatCurrency(totals.total)}</span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Button
            size="xl"
            variant="success"
            className="h-16 text-lg font-semibold"
            onClick={onPayCash}
            disabled={disabled || items.length === 0}
          >
            Cash
          </Button>
          <Button
            size="xl"
            className="h-16 bg-blue-600 text-lg font-semibold hover:bg-blue-700"
            onClick={onPayCard}
            disabled={disabled || items.length === 0}
          >
            Card
          </Button>
        </div>
      </div>
    </div>
  );
}
