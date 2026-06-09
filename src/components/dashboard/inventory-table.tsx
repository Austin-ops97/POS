"use client";

import { useState } from "react";
import { Warehouse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";

export type InventoryRow = {
  id: string;
  productName: string;
  sku: string | null;
  quantityOnHand: number;
  reorderPoint: number;
  locationName: string;
};

export function InventoryTable({ items }: { items: InventoryRow[] }) {
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [adjustQty, setAdjustQty] = useState("");

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
              <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
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
                  {isAdjusting ? (
                    <div className="flex items-center justify-end gap-2">
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`qty-${item.id}`} className="sr-only">Adjust</Label>
                        <Input
                          id={`qty-${item.id}`}
                          type="number"
                          value={adjustQty}
                          onChange={(e) => setAdjustQty(e.target.value)}
                          className="w-20 h-8"
                          placeholder="+/-"
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={() => {
                          setAdjustingId(null);
                          setAdjustQty("");
                        }}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setAdjustingId(null);
                          setAdjustQty("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setAdjustingId(item.id);
                        setAdjustQty("");
                      }}
                    >
                      Adjust
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
