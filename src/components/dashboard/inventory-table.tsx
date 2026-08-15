"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, Trash2, Warehouse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/dashboard/empty-state";
import {
  adjustmentDelta,
  clampOnHand,
  type InventoryAdjustType,
} from "@/lib/inventory-quantity";

export type InventoryRow = {
  id: string;
  productName: string;
  sku: string | null;
  quantityOnHand: number;
  reorderPoint: number;
  locationId: string;
  locationName: string;
};

const ADJUSTMENT_TYPES: { value: InventoryAdjustType; label: string }[] = [
  { value: "MANUAL_ADJUSTMENT", label: "Add units" },
  { value: "RECEIVED", label: "Received" },
  { value: "RETURN_TO_STOCK", label: "Return to stock" },
  { value: "DAMAGED", label: "Damaged" },
  { value: "LOST", label: "Lost" },
  { value: "TRANSFER", label: "Transfer to location" },
];

function unitsLabel(type: InventoryAdjustType) {
  switch (type) {
    case "TRANSFER":
      return "Units to transfer";
    case "DAMAGED":
      return "Damaged units";
    case "LOST":
      return "Lost units";
    case "RECEIVED":
      return "Units received";
    case "RETURN_TO_STOCK":
      return "Units returned";
    default:
      return "Units to add";
  }
}

function AdjustForm({
  itemId,
  idPrefix,
  adjustType,
  setAdjustType,
  adjustQty,
  setAdjustQty,
  reason,
  setReason,
  toLocationId,
  setToLocationId,
  locations,
  sourceLocationId,
  saving,
  onSave,
  onCancel,
  supplier,
  setSupplier,
  referenceNumber,
  setReferenceNumber,
  unitCost,
  setUnitCost,
}: {
  itemId: string;
  idPrefix: string;
  adjustType: InventoryAdjustType;
  setAdjustType: (v: InventoryAdjustType) => void;
  adjustQty: number;
  setAdjustQty: (v: number) => void;
  reason: string;
  setReason: (v: string) => void;
  toLocationId: string;
  setToLocationId: (v: string) => void;
  locations: Array<{ id: string; name: string }>;
  sourceLocationId: string;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  supplier: string;
  setSupplier: (v: string) => void;
  referenceNumber: string;
  setReferenceNumber: (v: string) => void;
  unitCost: string;
  setUnitCost: (v: string) => void;
}) {
  const typeId = `${idPrefix}-type-${itemId}`;
  const qtyId = `${idPrefix}-qty-${itemId}`;
  const reasonId = `${idPrefix}-reason-${itemId}`;
  const locationFieldId = `${idPrefix}-location-${itemId}`;
  const destLocations = locations.filter((l) => l.id !== sourceLocationId);
  const isTransfer = adjustType === "TRANSFER";
  const isReceive = adjustType === "RECEIVED";

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="w-full space-y-2 sm:w-auto">
        <Label htmlFor={typeId}>Type</Label>
        <Select
          value={adjustType}
          onValueChange={(v) => setAdjustType(v as InventoryAdjustType)}
        >
          <SelectTrigger id={typeId} className="w-full sm:w-48">
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
      {isTransfer ? (
        <div className="w-full space-y-2 sm:w-auto">
          <Label htmlFor={locationFieldId}>Destination</Label>
          <Select value={toLocationId} onValueChange={setToLocationId}>
            <SelectTrigger id={locationFieldId} className="w-full sm:w-48">
              <SelectValue placeholder="Select location" />
            </SelectTrigger>
            <SelectContent>
              {destLocations.map((loc) => (
                <SelectItem key={loc.id} value={loc.id}>
                  {loc.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <div className="w-full space-y-2 sm:w-auto">
        <Label htmlFor={qtyId}>{unitsLabel(adjustType)}</Label>
        <QuantityStepper
          id={qtyId}
          value={adjustQty}
          onChange={setAdjustQty}
          min={1}
          disabled={saving}
          aria-label={unitsLabel(adjustType)}
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
      {isReceive ? (
        <>
          <Input
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder="Supplier"
            className="w-full sm:w-40"
          />
          <Input
            value={referenceNumber}
            onChange={(e) => setReferenceNumber(e.target.value)}
            placeholder="Invoice / ref"
            className="w-full sm:w-40"
          />
          <Input
            value={unitCost}
            onChange={(e) => setUnitCost(e.target.value)}
            placeholder="Unit cost"
            type="number"
            step="0.01"
            min="0"
            className="w-full sm:w-28"
          />
        </>
      ) : null}
      <div className="flex w-full gap-2 sm:w-auto">
        <Button
          size="sm"
          className="flex-1 sm:flex-none"
          disabled={saving}
          onClick={onSave}
        >
          {saving ? "Saving..." : isTransfer ? "Transfer" : "Save"}
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

export function InventoryTable({
  items,
  locations = [],
}: {
  items: InventoryRow[];
  locations?: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(items);
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [adjustQty, setAdjustQty] = useState(1);
  const [adjustType, setAdjustType] = useState<InventoryAdjustType>("MANUAL_ADJUSTMENT");
  const [reason, setReason] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<InventoryRow | null>(null);
  const [supplier, setSupplier] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    setRows(items);
  }, [items]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (row) =>
        row.productName.toLowerCase().includes(q) ||
        row.sku?.toLowerCase().includes(q) ||
        row.locationName.toLowerCase().includes(q)
    );
  }, [rows, search]);

  function resetAdjust() {
    setAdjustingId(null);
    setAdjustQty(1);
    setAdjustType("MANUAL_ADJUSTMENT");
    setReason("");
    setToLocationId("");
    setSupplier("");
    setReferenceNumber("");
    setUnitCost("");
  }

  function startAdjust(itemId: string) {
    setAdjustingId(itemId);
    setAdjustQty(1);
    setAdjustType("MANUAL_ADJUSTMENT");
    setReason("");
    setToLocationId("");
    setSupplier("");
    setReferenceNumber("");
    setUnitCost("");
  }

  async function setOnHand(item: InventoryRow, nextQty: number) {
    const quantityOnHand = clampOnHand(nextQty);
    const delta = quantityOnHand - item.quantityOnHand;
    if (delta === 0) return;

    const previous = item.quantityOnHand;
    setBusyId(item.id);
    setRows((current) =>
      current.map((row) =>
        row.id === item.id ? { ...row, quantityOnHand } : row
      )
    );
    try {
      const res = await fetch("/api/inventory/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventoryItemId: item.id,
          quantity: delta,
          type: "MANUAL_ADJUSTMENT",
          reason: "On-hand update",
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? "Failed to update units");
      }
      router.refresh();
    } catch (error) {
      setRows((current) =>
        current.map((row) =>
          row.id === item.id ? { ...row, quantityOnHand: previous } : row
        )
      );
      toast.error(error instanceof Error ? error.message : "Failed to update units");
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const item = pendingDelete;
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/inventory/${item.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(err?.error ?? "Failed to delete item");
        return;
      }
      setRows((current) => current.filter((row) => row.id !== item.id));
      if (adjustingId === item.id) resetAdjust();
      setPendingDelete(null);
      toast.success(`${item.productName} removed from inventory`);
      router.refresh();
    } catch {
      toast.error("Failed to delete item");
    } finally {
      setBusyId(null);
    }
  }

  async function handleSave(itemId: string) {
    const units = adjustQty;
    if (!Number.isInteger(units) || units < 1) {
      toast.error("Enter at least 1 unit");
      return;
    }

    setSaving(true);
    try {
      if (adjustType === "TRANSFER") {
        if (!toLocationId) {
          toast.error("Select a destination location");
          return;
        }
        const res = await fetch("/api/inventory/transfer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inventoryItemId: itemId,
            toLocationId,
            quantity: units,
            reason: reason.trim() || undefined,
          }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => null)) as { error?: string } | null;
          toast.error(err?.error ?? "Failed to transfer inventory");
          return;
        }
        toast.success("Inventory transferred");
      } else if (adjustType === "RECEIVED") {
        const res = await fetch("/api/inventory/receive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inventoryItemId: itemId,
            quantity: units,
            supplier: supplier.trim() || undefined,
            referenceNumber: referenceNumber.trim() || undefined,
            unitCost: unitCost ? Number(unitCost) : undefined,
            notes: reason.trim() || undefined,
          }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => null)) as { error?: string } | null;
          toast.error(err?.error ?? "Failed to receive inventory");
          return;
        }
        toast.success("Inventory received");
      } else {
        const quantity = adjustmentDelta(adjustType, units);
        const payload: {
          inventoryItemId: string;
          quantity: number;
          type: Exclude<InventoryAdjustType, "TRANSFER">;
          reason?: string;
        } = {
          inventoryItemId: itemId,
          quantity,
          type: adjustType,
        };
        const trimmedReason = reason.trim();
        if (trimmedReason) payload.reason = trimmedReason;

        const res = await fetch("/api/inventory/adjust", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => null)) as { error?: string } | null;
          toast.error(err?.error ?? "Failed to adjust inventory");
          return;
        }
        toast.success("Inventory updated");
      }

      resetAdjust();
      router.refresh();
    } catch {
      toast.error("Failed to update inventory");
    } finally {
      setSaving(false);
    }
  }

  function renderAdjustForm(item: InventoryRow, idPrefix: string) {
    return (
      <AdjustForm
        itemId={item.id}
        idPrefix={idPrefix}
        adjustType={adjustType}
        setAdjustType={setAdjustType}
        adjustQty={adjustQty}
        setAdjustQty={setAdjustQty}
        reason={reason}
        setReason={setReason}
        toLocationId={toLocationId}
        setToLocationId={setToLocationId}
        locations={locations}
        sourceLocationId={item.locationId}
        saving={saving}
        onSave={() => handleSave(item.id)}
        onCancel={resetAdjust}
        supplier={supplier}
        setSupplier={setSupplier}
        referenceNumber={referenceNumber}
        setReferenceNumber={setReferenceNumber}
        unitCost={unitCost}
        setUnitCost={setUnitCost}
      />
    );
  }

  if (rows.length === 0) {
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
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
        <Input
          placeholder="Search products, SKU, or location..."
          aria-label="Search inventory"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          enterKeyHint="search"
        />
      </div>

      {visibleRows.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-slate-500">
          No inventory items match your search.
        </p>
      ) : (
        <>
      <ul className="space-y-3 md:hidden">
        {visibleRows.map((item) => {
          const isLow = item.quantityOnHand <= item.reorderPoint;
          const isAdjusting = adjustingId === item.id;
          const busy = busyId === item.id;

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
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Units
                  </p>
                  <QuantityStepper
                    value={item.quantityOnHand}
                    onChange={(next) => void setOnHand(item, next)}
                    min={0}
                    disabled={busy || saving}
                    size="sm"
                    aria-label={`Units on hand for ${item.productName}`}
                  />
                </div>
                <div className="flex gap-2">
                  {!isAdjusting && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={adjustingId !== null || busy}
                      onClick={() => startAdjust(item.id)}
                      aria-label={`Adjust ${item.productName}`}
                    >
                      Adjust
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="outline"
                    className="text-red-600"
                    disabled={busy || saving}
                    onClick={() => setPendingDelete(item)}
                    aria-label={`Delete ${item.productName}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
              {isAdjusting && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  {renderAdjustForm(item, "mobile")}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-3 text-left font-medium text-slate-600">Product</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">SKU</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Location</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Units</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
              <th className="px-4 py-3 text-right font-medium text-slate-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((item) => {
              const isLow = item.quantityOnHand <= item.reorderPoint;
              const isAdjusting = adjustingId === item.id;
              const busy = busyId === item.id;

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
                    <td className="px-4 py-3">
                      <QuantityStepper
                        value={item.quantityOnHand}
                        onChange={(next) => void setOnHand(item, next)}
                        min={0}
                        disabled={busy || saving}
                        size="sm"
                        aria-label={`Units on hand for ${item.productName}`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      {isLow ? (
                        <Badge variant="warning">Low Stock</Badge>
                      ) : (
                        <Badge variant="success">In Stock</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {!isAdjusting && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={adjustingId !== null || busy}
                            onClick={() => startAdjust(item.id)}
                            aria-label={`Adjust ${item.productName}`}
                          >
                            Adjust
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-red-600"
                          disabled={busy || saving}
                          onClick={() => setPendingDelete(item)}
                          aria-label={`Delete ${item.productName}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                  {isAdjusting && (
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <td colSpan={6} className="px-4 py-4">
                        {renderAdjustForm(item, "desktop")}
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
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="Remove from inventory?"
        description={
          pendingDelete
            ? `Remove "${pendingDelete.productName}" from ${pendingDelete.locationName}? This deletes the stock row at this location. The product stays in your catalog.`
            : ""
        }
        confirmLabel="Delete"
        variant="destructive"
        loading={busyId === pendingDelete?.id}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
