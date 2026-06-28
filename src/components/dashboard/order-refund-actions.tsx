"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";

type RefundReason =
  | "CUSTOMER_RETURN"
  | "DAMAGED_ITEM"
  | "WRONG_ITEM"
  | "DUPLICATE_CHARGE"
  | "CUSTOMER_SATISFACTION"
  | "OTHER";

const REFUND_REASONS: { value: RefundReason; label: string }[] = [
  { value: "CUSTOMER_RETURN", label: "Customer return" },
  { value: "DAMAGED_ITEM", label: "Damaged item" },
  { value: "WRONG_ITEM", label: "Wrong item" },
  { value: "DUPLICATE_CHARGE", label: "Duplicate charge" },
  { value: "CUSTOMER_SATISFACTION", label: "Customer satisfaction" },
  { value: "OTHER", label: "Other" },
];

type RefundOrderItem = {
  id: string;
  name: string;
  availableQty: number;
};

type OrderRefundActionsProps = {
  orderId: string;
  canRefund: boolean;
  remainingRefundable: number;
  items: RefundOrderItem[];
};

export function OrderRefundActions({
  orderId,
  canRefund,
  remainingRefundable,
  items,
}: OrderRefundActionsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reason, setReason] = useState<RefundReason>("CUSTOMER_RETURN");
  const [reasonNote, setReasonNote] = useState("");
  const [returnToStock, setReturnToStock] = useState(false);
  const [partialAmount, setPartialAmount] = useState("");
  const [refundType, setRefundType] = useState<"full" | "partial">("full");

  if (!canRefund) return null;

  function resetForm() {
    setReason("CUSTOMER_RETURN");
    setReasonNote("");
    setReturnToStock(false);
    setPartialAmount("");
    setRefundType("full");
  }

  function closeDialog() {
    if (submitting) return;
    setOpen(false);
    resetForm();
  }

  async function handleSubmit() {
    const payload: {
      reason: RefundReason;
      reasonNote?: string;
      returnToStock?: boolean;
      customAmount?: number;
      items?: { orderItemId: string; quantity: number }[];
    } = { reason };

    const trimmedNote = reasonNote.trim();
    if (trimmedNote) {
      payload.reasonNote = trimmedNote;
    }

    if (refundType === "partial") {
      const amount = Number.parseFloat(partialAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        toast.error("Enter a valid partial refund amount");
        return;
      }
      if (amount > remainingRefundable + 0.01) {
        toast.error(
          `Amount cannot exceed ${formatCurrency(remainingRefundable)}`
        );
        return;
      }
      payload.customAmount = amount;
    } else if (returnToStock) {
      const refundableItems = items
        .filter((item) => item.availableQty > 0)
        .map((item) => ({
          orderItemId: item.id,
          quantity: item.availableQty,
        }));

      if (refundableItems.length > 0) {
        payload.items = refundableItems;
        payload.returnToStock = true;
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        toast.error(err?.error ?? "Failed to issue refund");
        return;
      }

      toast.success("Refund issued");
      closeDialog();
      router.refresh();
    } catch {
      toast.error("Failed to issue refund");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <RotateCcw className="h-4 w-4" />
        Issue Refund
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={closeDialog}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <button
              type="button"
              onClick={closeDialog}
              disabled={submitting}
              className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
            >
              <X className="h-5 w-5" />
            </button>

            <h2 className="text-lg font-semibold text-slate-900">Issue Refund</h2>
            <p className="mt-1 text-sm text-slate-500">
              Remaining refundable balance:{" "}
              <span className="font-medium text-slate-900">
                {formatCurrency(remainingRefundable)}
              </span>
            </p>

            <div className="mt-5 space-y-4">
              <div className="space-y-2">
                <Label>Refund type</Label>
                <Select
                  value={refundType}
                  onValueChange={(v) => setRefundType(v as "full" | "partial")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">
                      Full refund ({formatCurrency(remainingRefundable)})
                    </SelectItem>
                    <SelectItem value="partial">Partial amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {refundType === "partial" && (
                <div className="space-y-2">
                  <Label htmlFor="partialAmount">Refund amount</Label>
                  <Input
                    id="partialAmount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={remainingRefundable}
                    value={partialAmount}
                    onChange={(e) => setPartialAmount(e.target.value)}
                    disabled={submitting}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>Reason</Label>
                <Select
                  value={reason}
                  onValueChange={(v) => setReason(v as RefundReason)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REFUND_REASONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reasonNote">Note (optional)</Label>
                <Textarea
                  id="reasonNote"
                  value={reasonNote}
                  onChange={(e) => setReasonNote(e.target.value)}
                  rows={2}
                  disabled={submitting}
                />
              </div>

              {refundType === "full" && items.some((i) => i.availableQty > 0) && (
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="returnToStock"
                    checked={returnToStock}
                    onCheckedChange={(v) => setReturnToStock(v === true)}
                    disabled={submitting}
                  />
                  <Label htmlFor="returnToStock">Return items to stock</Label>
                </div>
              )}
            </div>

            <div className="mt-6 flex gap-3">
              <Button disabled={submitting} onClick={handleSubmit}>
                {submitting ? "Processing..." : "Confirm Refund"}
              </Button>
              <Button
                variant="outline"
                disabled={submitting}
                onClick={closeDialog}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
