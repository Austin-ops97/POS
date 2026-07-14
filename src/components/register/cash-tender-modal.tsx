"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/utils";
import {
  calculateChangeDue,
  getQuickCashAmounts,
  parseTenderAmount,
  validateCashTender,
} from "@/lib/register/cash-tender";

type CashTenderModalProps = {
  open: boolean;
  total: number;
  defaultReceiptEmail?: string;
  processing?: boolean;
  onConfirm: (data: {
    amountTendered: number;
    changeDue: number;
    receiptEmail?: string;
    skipReceipt: boolean;
  }) => void;
  onCancel: () => void;
};

export function CashTenderModal({
  open,
  total,
  defaultReceiptEmail,
  processing,
  onConfirm,
  onCancel,
}: CashTenderModalProps) {
  const titleId = useId();
  const descId = useId();
  const tenderInputRef = useRef<HTMLInputElement>(null);
  const [tendered, setTendered] = useState("");
  const [receiptEmail, setReceiptEmail] = useState(defaultReceiptEmail ?? "");
  const [skipReceipt, setSkipReceipt] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTendered("");
    setReceiptEmail(defaultReceiptEmail ?? "");
    setSkipReceipt(false);
    setTouched(false);
    const timer = setTimeout(() => tenderInputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [open, defaultReceiptEmail]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !processing) onCancel();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onCancel, processing]);

  if (!open) return null;

  const parsed = parseTenderAmount(tendered);
  const validation =
    parsed !== null ? validateCashTender(total, parsed) : null;
  const changeDue =
    parsed !== null ? calculateChangeDue(total, parsed) : 0;
  const quickAmounts = getQuickCashAmounts(total);
  const tenderError =
    touched && tendered.trim()
      ? parsed === null
        ? "Enter a valid amount (up to 2 decimal places)."
        : validation && !validation.valid
          ? validation.error
          : undefined
      : touched && !tendered.trim()
        ? "Enter amount tendered."
        : undefined;

  const emailInvalid =
    !skipReceipt &&
    receiptEmail.trim().length > 0 &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(receiptEmail.trim());

  function handleConfirm() {
    setTouched(true);
    if (parsed === null || !validation?.valid) return;
    if (emailInvalid) return;
    onConfirm({
      amountTendered: parsed,
      changeDue,
      receiptEmail: skipReceipt ? undefined : receiptEmail.trim() || undefined,
      skipReceipt,
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !processing) {
      e.preventDefault();
      handleConfirm();
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={processing ? undefined : onCancel}
      />
      <div className="relative flex max-h-[95vh] w-full max-w-md flex-col overflow-y-auto rounded-t-2xl border border-slate-200 bg-white p-6 shadow-2xl sm:rounded-2xl">
        <button
          type="button"
          onClick={onCancel}
          disabled={processing}
          className="absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 id={titleId} className="pr-8 text-xl font-semibold text-slate-900">
          Cash payment
        </h2>
        <p id={descId} className="mt-1 text-sm text-slate-500">
          Enter the amount received from the customer.
        </p>

        <div className="mt-6 rounded-xl bg-slate-50 p-4 text-center">
          <p className="text-sm text-slate-500">Order total</p>
          <p className="text-3xl font-bold text-slate-900">
            {formatCurrency(total)}
          </p>
        </div>

        <div className="mt-6 space-y-2">
          <Label htmlFor="cash-tendered">Amount tendered</Label>
          <Input
            ref={tenderInputRef}
            id="cash-tendered"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={tendered}
            onChange={(e) => setTendered(e.target.value)}
            onBlur={() => setTouched(true)}
            onKeyDown={handleKeyDown}
            disabled={processing}
            placeholder="0.00"
            aria-invalid={!!tenderError}
            aria-describedby={tenderError ? "tender-error" : undefined}
            className="h-12 text-lg"
          />
          {tenderError && (
            <p id="tender-error" className="text-sm text-red-600" role="alert">
              {tenderError}
            </p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {quickAmounts.map((amount) => (
            <Button
              key={amount}
              type="button"
              variant="outline"
              size="sm"
              className="min-h-10 flex-1 sm:flex-none"
              disabled={processing}
              onClick={() => {
                setTendered(amount.toFixed(2));
                setTouched(true);
              }}
            >
              {amount === total ? "Exact" : formatCurrency(amount)}
            </Button>
          ))}
        </div>

        {parsed !== null && validation?.valid && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-center">
            <p className="text-sm text-emerald-700">Change due</p>
            <p className="text-2xl font-bold text-emerald-800">
              {formatCurrency(changeDue)}
            </p>
          </div>
        )}

        <div className="mt-6 space-y-2 border-t border-slate-100 pt-4">
          <Label htmlFor="receipt-email">Receipt email (optional)</Label>
          <Input
            id="receipt-email"
            type="email"
            value={receiptEmail}
            onChange={(e) => setReceiptEmail(e.target.value)}
            disabled={processing || skipReceipt}
            placeholder="customer@example.com"
            className="h-11"
          />
          {emailInvalid && (
            <p className="text-sm text-red-600" role="alert">
              Enter a valid email address.
            </p>
          )}
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={skipReceipt}
              onChange={(e) => setSkipReceipt(e.target.checked)}
              disabled={processing}
              className="h-4 w-4 rounded border-slate-300"
            />
            No receipt / skip email
          </label>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="min-h-12 flex-1"
            onClick={onCancel}
            disabled={processing}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="lg"
            variant="success"
            className="min-h-12 flex-1"
            onClick={handleConfirm}
            disabled={
              processing ||
              parsed === null ||
              !validation?.valid ||
              emailInvalid
            }
          >
            {processing ? "Processing..." : "Confirm payment"}
          </Button>
        </div>
      </div>
    </div>
  );
}
