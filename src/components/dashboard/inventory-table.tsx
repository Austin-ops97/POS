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
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <table className="w-full text-sm">
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
                  <td className="px-4 py-3 font-medium text-slate-900">{item.productName}</td>
                  <td className="px-4 py-3 text-slate-600">{item.sku || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{item.locationName}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{item.quantityOnHand}</td>
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
                      >
                        Adjust
                      </Button>
                    )}
                  </td>
                </tr>
                {isAdjusting && (
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <td colSpan={6} className="px-4 py-4">
                      <div className="flex flex-wrap items-end gap-4">
                        <div className="space-y-2">
                          <Label htmlFor={`type-${item.id}`}>Type</Label>
                          <Select
                            value={adjustType}
                            onValueChange={(v) => setAdjustType(v as AdjustType)}
                          >
                            <SelectTrigger id={`type-${item.id}`} className="w-44">
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
                        <div className="space-y-2">
                          <Label htmlFor={`qty-${item.id}`}>Quantity change</Label>
                          <Input
                            id={`qty-${item.id}`}
                            type="number"
                            step="1"
                            value={adjustQty}
                            onChange={(e) => setAdjustQty(e.target.value)}
                            className="w-28"
                            placeholder="+/-"
                            disabled={saving}
                          />
                        </div>
                        <div className="min-w-[200px] flex-1 space-y-2">
                          <Label htmlFor={`reason-${item.id}`}>Reason (optional)</Label>
                          <Input
                            id={`reason-${item.id}`}
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Note"
                            disabled={saving}
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={saving}
                            onClick={() => handleSave(item.id)}
                          >
                            {saving ? "Saving..." : "Save"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={saving}
                            onClick={resetAdjust}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
