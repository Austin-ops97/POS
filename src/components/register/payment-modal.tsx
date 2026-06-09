"use client";

import { useEffect } from "react";
import {
  CheckCircle2,
  CreditCard,
  Loader2,
  X,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

export type PaymentModalState = "idle" | "loading" | "success" | "error";

type PaymentModalProps = {
  open: boolean;
  onClose: () => void;
  method: "CARD" | "CASH";
  amount: number;
  state: PaymentModalState;
  message?: string;
  orderNumber?: string;
};

export function PaymentModal({
  open,
  onClose,
  method,
  amount,
  state,
  message,
  orderNumber,
}: PaymentModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && state !== "loading") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose, state]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={state !== "loading" ? onClose : undefined}
      />
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-2xl">
        {state !== "loading" && (
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        )}

        <div className="flex flex-col items-center text-center">
          {state === "loading" && (
            <>
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-slate-100">
                <Loader2 className="h-10 w-10 animate-spin text-slate-600" />
              </div>
              <h2 className="text-xl font-semibold text-slate-900">
                Processing {method === "CARD" ? "Card" : "Cash"} Payment
              </h2>
              <p className="mt-2 text-3xl font-bold text-slate-900">
                {formatCurrency(amount)}
              </p>
              <p className="mt-4 text-sm text-slate-500">
                {method === "CARD"
                  ? "Waiting for payment confirmation..."
                  : "Recording cash payment..."}
              </p>
            </>
          )}

          {state === "success" && (
            <>
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle2 className="h-10 w-10 text-emerald-600" />
              </div>
              <h2 className="text-xl font-semibold text-slate-900">
                Payment Successful
              </h2>
              <p className="mt-2 text-3xl font-bold text-emerald-600">
                {formatCurrency(amount)}
              </p>
              {orderNumber && (
                <p className="mt-2 text-sm text-slate-500">
                  Order {orderNumber}
                </p>
              )}
              <Button
                size="lg"
                className="mt-8 w-full"
                variant="success"
                onClick={onClose}
              >
                Done
              </Button>
            </>
          )}

          {state === "error" && (
            <>
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-100">
                <XCircle className="h-10 w-10 text-red-600" />
              </div>
              <h2 className="text-xl font-semibold text-slate-900">
                Payment Failed
              </h2>
              <p className="mt-2 text-sm text-red-600">
                {message || "Something went wrong. Please try again."}
              </p>
              <div className="mt-8 flex w-full gap-3">
                <Button
                  size="lg"
                  variant="outline"
                  className="flex-1"
                  onClick={onClose}
                >
                  Cancel
                </Button>
                <Button size="lg" className="flex-1" onClick={onClose}>
                  Try Again
                </Button>
              </div>
            </>
          )}

          {state === "idle" && (
            <>
              <div
                className={cn(
                  "mb-6 flex h-20 w-20 items-center justify-center rounded-full",
                  method === "CARD" ? "bg-blue-100" : "bg-emerald-100"
                )}
              >
                <CreditCard
                  className={cn(
                    "h-10 w-10",
                    method === "CARD" ? "text-blue-600" : "text-emerald-600"
                  )}
                />
              </div>
              <h2 className="text-xl font-semibold text-slate-900">
                Confirm {method === "CARD" ? "Card" : "Cash"} Payment
              </h2>
              <p className="mt-2 text-3xl font-bold text-slate-900">
                {formatCurrency(amount)}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
