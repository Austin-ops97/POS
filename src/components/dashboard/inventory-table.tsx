"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Warehouse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/dashboard/empty-state";

export type InventoryRow = {
  id: string;
  productName: string;
  sku: string | null;
  quantityOnHand: number;
  reorderPoint: number;
  locationName: string;
};

type AdjustType =
  | "MANUAL_ADJUSTMENT"
  | "DAMAGED"
  | "LOST"
  | "RECEIVED"
  | "RETURN_TO_STOCK";

const ADJUSTMENT_TYPES: { value: AdjustType; label: string }[] = [
  { value: "MANUAL_ADJUSTMENT", label: "Manual adjustment" },
  { value: "RECEIVED", label: "Received" },
  { value: "RETURN_TO_STOCK", label: "Return to stock" },
  { value: "DAMAGED", label: "Damaged" },
  { value: "LOST", label: "Lost" },
];

function AdjustForm({
  itemId,
  idPrefix,
  adjustType,
  setAdjustType,
  adjustQty,
  setAdjustQty,
  reason,
  setReason,
  saving,
  onSave,
  onCancel,
}: {
  itemId: string;
  idPrefix: string;
  adjustType: AdjustType;
  setAdjustType: (v: AdjustType) => void;
  adjustQty: string;
  setAdjustQty: (v: string) => void;
  reason: string;
  setReason: (v: string) => void;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const typeId = `${idPrefix}-type-${itemId}`;
  const qtyId = `${idPrefix}-qty-${itemId}`;
  const reasonId = `${idPrefix}-reason-${itemId}`;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="w-full space-y-2 sm:w-auto">
        <Label htmlFor={typeId}>Type</Label>
        <Select
          value={adjustType}
          onValueChange={(v) => setAdjustType(v as AdjustType)}
        >
          <SelectTrigger id={typeId} className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ADJUSTMENT_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="w-full space-y-2 sm:w-auto">
        <Label htmlFor={qtyId}>Quantity change</Label>
        <Input
          id={qtyId}
          type="number"
          inputMode="numeric"
          step="1"
          value={adjustQty}
          onChange={(e) => setAdjustQty(e.target.value)}
          className="w-full sm:w-28"
          placeholder="+/-"
          disabled={saving}
        />
      </div>
      <div className="w-full min-w-0 flex-1 space-y-2 sm:min-w-[200px]">
        <Label htmlFor={reasonId}>Reason (optional)</Label>
        <Input
          id={reasonId}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Note"
          disabled={saving}
        />
      </div>
      <div className="flex w-full gap-2 sm:w-auto">
        <Button
          size="sm"
          className="flex-1 sm:flex-none"
          disabled={saving}
          onClick={onSave}
        >
          {saving ? "Saving..." : "Save"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="flex-1 sm:flex-none"
          disabled={saving}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function InventoryTable({ items }: { items: InventoryRow[] }) {
  const router = useRouter();
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustType, setAdjustType] = useState<AdjustType>("MANUAL_ADJUSTMENT");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  function resetAdjust() {
    setAdjustingId(null);
    setAdjustQty("");
    setAdjustType("MANUAL_ADJUSTMENT");
    setReason("");
  }

  function startAdjust(itemId: string) {
    setAdjustingId(itemId);
    setAdjustQty("");
    setAdjustType("MANUAL_ADJUSTMENT");
    setReason("");
  }

  async function handleSave(itemId: string) {
    const quantity = Number.parseInt(adjustQty, 10);
    if (!Number.isInteger(quantity) || quantity === 0) {
      toast.error("Enter a valid non-zero quantity");
      return;
    }

    const payload: {
      inventoryItemId: string;
      quantity: number;
      type: AdjustType;
      reason?: string;
    } = {
      inventoryItemId: itemId,
      quantity,
      type: adjustType,
    };

    const trimmedReason = reason.trim();
    if (trimmedReason) {
      payload.reason = trimmedReason;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/inventory/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        toast.error(err?.error ?? "Failed to adjust inventory");
        return;
      }

      toast.success("Inventory updated");
      resetAdjust();
      router.refresh();
    } catch {
      toast.error("Failed to adjust inventory");
    } finally {
      setSaving(false);
    }
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Warehouse}
        title="No inventory tracked"
        description="Products with inventory tracking will appear here."
        actionLabel="Add Product"
        actionHref="/products/new"
      />
    );
  }

  return (
    <>
      <ul className="space-y-3 md:hidden">
        {items.map((item) => {
          const isLow = item.quantityOnHand <= item.reorderPoint;
          const isAdjusting = adjustingId === item.id;

          return (
            <li
              key={item.id}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">
                    {item.productName}
                  </p>
                  <p className="mt-0.5 truncate text-sm text-slate-500">
                    {item.sku || "No SKU"} · {item.locationName}
                  </p>
                </div>
                {isLow ? (
                  <Badge variant="warning">Low Stock</Badge>
                ) : (
                  <Badge variant="success">In Stock</Badge>
                )}
              </div>
              <div className="mt-3 flex items-end justify-between gap-3">
                <p className="text-lg font-bold text-slate-900">
                  {item.quantityOnHand}
                  <span className="ml-1 text-sm font-normal text-slate-500">
                    on hand
                  </span>
                </p>
                {!isAdjusting && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={adjustingId !== null && !isAdjusting}
                    onClick={() => startAdjust(item.id)}
                    aria-label={`Adjust ${item.productName}`}
                  >
                    Adjust
                  </Button>
                )}
              </div>
              {isAdjusting && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <AdjustForm
                    itemId={item.id}
                    idPrefix="mobile"
                    adjustType={adjustType}
                    setAdjustType={setAdjustType}
                    adjustQty={adjustQty}
                    setAdjustQty={setAdjustQty}
                    reason={reason}
                    setReason={setReason}
                    saving={saving}
                    onSave={() => handleSave(item.id)}
                    onCancel={resetAdjust}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-3 text-left font-medium text-slate-600">Product</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">SKU</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Location</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">On Hand</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
              <th className="px-4 py-3 text-right font-medium text-slate-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const isLow = item.quantityOnHand <= item.reorderPoint;
              const isAdjusting = adjustingId === item.id;

              return (
                <Fragment key={item.id}>
                  <tr className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="max-w-[14rem] truncate px-4 py-3 font-medium text-slate-900">
                      {item.productName}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{item.sku || "—"}</td>
                    <td className="max-w-[10rem] truncate px-4 py-3 text-slate-600">
                      {item.locationName}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {item.quantityOnHand}
                    </td>
                    <td className="px-4 py-3">
                      {isLow ? (
                        <Badge variant="warning">Low Stock</Badge>
                      ) : (
                        <Badge variant="success">In Stock</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!isAdjusting && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={adjustingId !== null && !isAdjusting}
                          onClick={() => startAdjust(item.id)}
                          aria-label={`Adjust ${item.productName}`}
                        >
                          Adjust
                        </Button>
                      )}
                    </td>
                  </tr>
                  {isAdjusting && (
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <td colSpan={6} className="px-4 py-4">
                        <AdjustForm
                          itemId={item.id}
                          idPrefix="desktop"
                          adjustType={adjustType}
                          setAdjustType={setAdjustType}
                          adjustQty={adjustQty}
                          setAdjustQty={setAdjustQty}
                          reason={reason}
                          setReason={setReason}
                          saving={saving}
                          onSave={() => handleSave(item.id)}
                          onCancel={resetAdjust}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
