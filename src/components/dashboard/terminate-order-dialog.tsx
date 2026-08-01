"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  ORDER_TERMINATION_REASONS,
  type TerminateOrderInput,
} from "@/lib/validations/orders";

const REASON_LABELS: Record<(typeof ORDER_TERMINATION_REASONS)[number], string> = {
  CUSTOMER_CANCELED: "Customer canceled",
  DUPLICATE_ORDER: "Duplicate order",
  ENTERED_BY_MISTAKE: "Entered by mistake",
  PAYMENT_ABANDONED: "Payment abandoned",
  REGISTER_INTERRUPTION: "Register interruption",
  OTHER: "Other",
};

export type TerminateOrderDialogOrder = {
  id: string;
  orderNumber: string;
  customerName: string | null;
  total: number;
  createdAt: string;
  employeeName?: string | null;
};

type TerminateOrderDialogProps = {
  order: TerminateOrderDialogOrder;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTerminated?: (result: {
    id: string;
    status: string;
    alreadyTerminated?: boolean;
  }) => void;
  /** When true, renders a trigger button that opens the dialog. */
  showTrigger?: boolean;
  triggerLabel?: string;
};

export function TerminateOrderDialog({
  order,
  open,
  onOpenChange,
  onTerminated,
  showTrigger = false,
  triggerLabel = "Terminate",
}: TerminateOrderDialogProps) {
  const [reason, setReason] =
    useState<TerminateOrderInput["reason"]>("CUSTOMER_CANCELED");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function resetForm() {
    setReason("CUSTOMER_CANCELED");
    setNotes("");
  }

  function handleOpenChange(next: boolean) {
    if (submitting) return;
    onOpenChange(next);
    if (!next) resetForm();
  }

  async function handleSubmit() {
    if (submitting) return;

    const trimmedNotes = notes.trim();
    if (reason === "OTHER" && !trimmedNotes) {
      toast.error("Please add notes for Other");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/terminate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason,
          notes: trimmedNotes || null,
        }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        toast.error(err?.error ?? "Failed to terminate order");
        return;
      }

      const data = (await res.json()) as {
        order?: { id: string; status: string; alreadyTerminated?: boolean };
      };

      toast.success(
        data.order?.alreadyTerminated
          ? "Order was already terminated"
          : "Order terminated"
      );
      onOpenChange(false);
      resetForm();
      onTerminated?.({
        id: order.id,
        status: data.order?.status ?? "CANCELED",
        alreadyTerminated: data.order?.alreadyTerminated,
      });
    } catch {
      toast.error("Failed to terminate order");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {showTrigger && (
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(true)}
        >
          <Ban className="h-4 w-4" />
          {triggerLabel}
        </Button>
      )}

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent showClose={!submitting} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Terminate order</DialogTitle>
            <DialogDescription>
              This cancels the pending order and any open payment intents. Paid
              orders cannot be terminated — use refund instead.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
            <p className="font-medium">Confirm termination</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-amber-900/90">
              <dt className="text-amber-800/70">Order</dt>
              <dd className="font-medium">{order.orderNumber}</dd>
              <dt className="text-amber-800/70">Customer</dt>
              <dd>{order.customerName || "Walk-in"}</dd>
              <dt className="text-amber-800/70">Total</dt>
              <dd>{formatCurrency(order.total)}</dd>
              <dt className="text-amber-800/70">Created</dt>
              <dd>{formatDate(order.createdAt)}</dd>
              {order.employeeName ? (
                <>
                  <dt className="text-amber-800/70">Employee</dt>
                  <dd>{order.employeeName}</dd>
                </>
              ) : null}
            </dl>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Reason</Label>
              <Select
                value={reason}
                onValueChange={(v) =>
                  setReason(v as TerminateOrderInput["reason"])
                }
                disabled={submitting}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORDER_TERMINATION_REASONS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {REASON_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`terminate-notes-${order.id}`}>
                Notes{reason === "OTHER" ? " (required)" : " (optional)"}
              </Label>
              <Textarea
                id={`terminate-notes-${order.id}`}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                disabled={submitting}
                placeholder={
                  reason === "OTHER" ? "Explain why this order is terminated" : undefined
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => handleOpenChange(false)}
            >
              Keep order
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={submitting}
              onClick={() => void handleSubmit()}
            >
              {submitting ? "Terminating..." : "Terminate order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
