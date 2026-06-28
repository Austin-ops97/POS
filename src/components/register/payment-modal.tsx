"use client";

import { useEffect, useId } from "react";
import {
  Banknote,
  CheckCircle2,
  CreditCard,
  Loader2,
  X,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { CardPaymentCheckout } from "@/components/register/card-payment-form";
import { OrderReceiptActions } from "@/components/receipts/order-receipt-actions";
import { isValidReceiptEmail } from "@/lib/register/receipt-email";

export type PaymentModalState =
  | "idle"
  | "loading"
  | "card_entry"
  | "success"
  | "error";

type CardCheckoutProps = {
  clientSecret: string;
  stripeAccountId: string;
  orderId: string;
  onSuccess: (orderNumber?: string) => void;
  onError: (message: string) => void;
  onCancel: () => void;
};

type PaymentModalProps = {
  open: boolean;
  onClose: () => void;
  onNewSale: () => void;
  method: "CARD" | "CASH";
  amount: number;
  state: PaymentModalState;
  message?: string;
  orderNumber?: string;
  orderId?: string;
  changeDue?: number;
  customerName?: string;
  defaultReceiptEmail?: string;
  receiptEmail?: string;
  onReceiptEmailChange?: (email: string) => void;
  skipReceiptEmail?: boolean;
  onSkipReceiptEmailChange?: (skip: boolean) => void;
  cardCheckout?: CardCheckoutProps | null;
};

export function PaymentModal({
  open,
  onClose,
  onNewSale,
  method,
  amount,
  state,
  message,
  orderNumber,
  orderId,
  changeDue,
  customerName,
  defaultReceiptEmail,
  receiptEmail = "",
  onReceiptEmailChange,
  skipReceiptEmail,
  onSkipReceiptEmailChange,
  cardCheckout,
}: PaymentModalProps) {
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && state !== "loading" && state !== "card_entry") {
        if (state === "success") onNewSale();
        else onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose, onNewSale, state]);

  if (!open) return null;

  const emailInvalid =
    !skipReceiptEmail &&
    receiptEmail.trim().length > 0 &&
    !isValidReceiptEmail(receiptEmail);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={
          state !== "loading" && state !== "card_entry"
            ? state === "success"
              ? onNewSale
              : onClose
            : undefined
        }
      />
      <div className="relative flex max-h-[95vh] w-full max-w-md flex-col overflow-y-auto rounded-t-2xl border border-slate-200 bg-white p-6 shadow-2xl sm:rounded-2xl sm:p-8">
        {state !== "loading" && (
          <button
            type="button"
            onClick={state === "success" ? onNewSale : onClose}
            className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        )}

        <div className="flex flex-col items-center text-center">
          {state === "card_entry" && method === "CARD" && cardCheckout && (
            <>
              <h2 id={titleId} className="mb-2 text-xl font-semibold text-slate-900">
                Enter card details
              </h2>
              <p id={descId} className="sr-only">
                Complete card payment for {formatCurrency(amount)}
              </p>
              <p className="mb-4 text-3xl font-bold text-slate-900">
                {formatCurrency(amount)}
              </p>
              {onReceiptEmailChange && (
                <div className="mb-4 w-full space-y-2 text-left">
                  <Label htmlFor="card-receipt-email">Receipt email (optional)</Label>
                  <Input
                    id="card-receipt-email"
                    type="email"
                    value={receiptEmail}
                    onChange={(e) => onReceiptEmailChange(e.target.value)}
                    placeholder={defaultReceiptEmail || "customer@example.com"}
                    disabled={skipReceiptEmail}
                    className="h-11"
                  />
                  {emailInvalid && (
                    <p className="text-sm text-red-600" role="alert">
                      Enter a valid email address.
                    </p>
                  )}
                  {onSkipReceiptEmailChange && (
                    <label className="flex items-center gap-2 text-sm text-slate-600">
                      <input
                        type="checkbox"
                        checked={!!skipReceiptEmail}
                        onChange={(e) => onSkipReceiptEmailChange(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      No receipt / skip email
                    </label>
                  )}
                </div>
              )}
              <CardPaymentCheckout
                clientSecret={cardCheckout.clientSecret}
                stripeAccountId={cardCheckout.stripeAccountId}
                amount={amount}
                orderId={cardCheckout.orderId}
                onSuccess={(confirmedOrderNumber) => {
                  cardCheckout.onSuccess(confirmedOrderNumber);
                }}
                onError={cardCheckout.onError}
                onCancel={cardCheckout.onCancel}
              />
            </>
          )}

          {state === "loading" && (
            <>
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-slate-100">
                <Loader2 className="h-10 w-10 animate-spin text-slate-600" />
              </div>
              <h2 id={titleId} className="text-xl font-semibold text-slate-900">
                Processing {method === "CARD" ? "card" : "cash"} payment
              </h2>
              <p id={descId} className="mt-2 text-3xl font-bold text-slate-900">
                {formatCurrency(amount)}
              </p>
              <p className="mt-4 text-sm text-slate-500">
                {method === "CARD"
                  ? message || "Preparing card payment..."
                  : "Recording cash payment..."}
              </p>
            </>
          )}

          {state === "success" && (
            <>
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle2 className="h-10 w-10 text-emerald-600" />
              </div>
              <h2 id={titleId} className="text-xl font-semibold text-slate-900">
                Payment successful
              </h2>
              <p id={descId} className="sr-only">
                Sale completed for {formatCurrency(amount)}
              </p>
              <p className="mt-2 text-3xl font-bold text-emerald-600">
                {formatCurrency(amount)}
              </p>
              {orderNumber && (
                <p className="mt-2 text-sm font-medium text-slate-700">
                  Order {orderNumber}
                </p>
              )}
              <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                {method === "CARD" ? (
                  <CreditCard className="h-4 w-4" />
                ) : (
                  <Banknote className="h-4 w-4" />
                )}
                <span>{method === "CARD" ? "Card" : "Cash"} payment</span>
              </div>
              {changeDue != null && changeDue > 0 && (
                <p className="mt-2 rounded-lg bg-amber-50 px-4 py-2 text-base font-semibold text-amber-900">
                  Change due: {formatCurrency(changeDue)}
                </p>
              )}
              {(customerName || defaultReceiptEmail) && (
                <div className="mt-3 w-full rounded-lg bg-slate-50 px-4 py-3 text-left text-sm text-slate-600">
                  {customerName && <p>Customer: {customerName}</p>}
                  {defaultReceiptEmail && <p>Email: {defaultReceiptEmail}</p>}
                </div>
              )}
              {orderId && (
                <div className="mt-6 w-full">
                  <OrderReceiptActions
                    orderId={orderId}
                    defaultEmail={defaultReceiptEmail}
                    variant="compact"
                  />
                </div>
              )}
              <Button
                size="lg"
                className="mt-4 min-h-12 w-full"
                variant="success"
                onClick={onNewSale}
              >
                New sale
              </Button>
            </>
          )}

          {state === "error" && (
            <>
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-100">
                <XCircle className="h-10 w-10 text-red-600" />
              </div>
              <h2 id={titleId} className="text-xl font-semibold text-slate-900">
                Payment failed
              </h2>
              <p id={descId} className="mt-2 text-sm text-red-600">
                {message || "Something went wrong. Please try again."}
              </p>
              <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row">
                <Button
                  size="lg"
                  variant="outline"
                  className="min-h-12 flex-1"
                  onClick={onClose}
                >
                  Cancel
                </Button>
                <Button size="lg" className="min-h-12 flex-1" onClick={onClose}>
                  Try again
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
                {method === "CARD" ? (
                  <CreditCard
                    className={cn("h-10 w-10", "text-blue-600")}
                  />
                ) : (
                  <Banknote className="h-10 w-10 text-emerald-600" />
                )}
              </div>
              <h2 id={titleId} className="text-xl font-semibold text-slate-900">
                Confirm {method === "CARD" ? "card" : "cash"} payment
              </h2>
              <p id={descId} className="mt-2 text-3xl font-bold text-slate-900">
                {formatCurrency(amount)}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
