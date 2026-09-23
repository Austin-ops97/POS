"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Nfc, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PaySheetFrame } from "@/components/register/pay-sheet-frame";
import { isValidReceiptEmail } from "@/lib/register/receipt-email";
import {
  resolveTapToPay,
  type TerminalReaderChoice,
} from "@/lib/register/tap-to-pay";
import { formatCurrency } from "@/lib/utils";

type Phase = "loading" | "unavailable" | "waiting" | "error";

type TapToPaySheetProps = {
  open: boolean;
  amount: number;
  defaultReceiptEmail?: string;
  receiptEmail: string;
  onReceiptEmailChange: (email: string) => void;
  skipReceiptEmail: boolean;
  onSkipReceiptEmailChange: (skip: boolean) => void;
  onPrepareOrder: () => Promise<{ id: string; orderNumber?: string }>;
  onSuccess: (orderId: string, orderNumber?: string) => void;
  onUseCard: () => void;
  onClose: () => void;
};

export function TapToPaySheet({
  open,
  amount,
  defaultReceiptEmail,
  receiptEmail,
  onReceiptEmailChange,
  skipReceiptEmail,
  onSkipReceiptEmailChange,
  onPrepareOrder,
  onSuccess,
  onUseCard,
  onClose,
}: TapToPaySheetProps) {
  const titleId = "tap-to-pay-title";
  const descId = "tap-to-pay-desc";
  const [phase, setPhase] = useState<Phase>("loading");
  const [message, setMessage] = useState("");
  const [reader, setReader] = useState<TerminalReaderChoice | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const runId = useRef(0);
  const orderIdRef = useRef<string | null>(null);
  const callbacks = useRef({ onPrepareOrder, onSuccess });
  callbacks.current = { onPrepareOrder, onSuccess };

  useEffect(() => {
    if (!open) return;
    const current = ++runId.current;
    orderIdRef.current = null;
    setPhase("loading");
    setMessage("");
    setReader(null);
    setOrderId(null);

    async function start() {
      try {
        const res = await fetch("/api/checkout/terminal");
        const data = (await res.json().catch(() => null)) as {
          readers?: TerminalReaderChoice[];
          error?: string;
        } | null;
        if (current !== runId.current) return;
        if (!res.ok) {
          throw new Error(data?.error || "Could not check for a reader");
        }

        const resolution = resolveTapToPay(data?.readers ?? []);
        if (resolution.mode === "unavailable") {
          setPhase("unavailable");
          setMessage(resolution.message);
          return;
        }

        setReader(resolution.reader);
        const order = await callbacks.current.onPrepareOrder();
        if (current !== runId.current) return;
        orderIdRef.current = order.id;

        const startRes = await fetch("/api/checkout/terminal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "start",
            orderId: order.id,
            readerId: resolution.reader.id,
          }),
        });
        const startData = (await startRes.json().catch(() => null)) as {
          status?: string;
          paid?: boolean;
          orderNumber?: string;
          error?: string;
          readerName?: string;
        } | null;
        if (current !== runId.current) return;
        if (!startRes.ok) {
          throw new Error(startData?.error || "Could not start the reader");
        }
        if (startData?.paid || startData?.status === "succeeded") {
          callbacks.current.onSuccess(order.id, startData.orderNumber || order.orderNumber);
          return;
        }
        setOrderId(order.id);
        if (startData?.readerName) {
          setReader((currentReader) =>
            currentReader ? { ...currentReader, name: startData.readerName! } : currentReader
          );
        }
        setPhase("waiting");
      } catch (error) {
        if (current !== runId.current) return;
        setMessage(error instanceof Error ? error.message : "Tap to Pay failed");
        setPhase("error");
      }
    }

    const timer = window.setTimeout(() => {
      if (current === runId.current) void start();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      runId.current += 1;
    };
  }, [open]);

  useEffect(() => {
    if (!open || phase !== "waiting" || !orderId) return;
    const activeOrderId = orderId;
    let stopped = false;

    async function poll() {
      try {
        const res = await fetch("/api/checkout/terminal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "status", orderId: activeOrderId }),
        });
        const data = (await res.json().catch(() => null)) as {
          status?: string;
          paid?: boolean;
          orderNumber?: string;
          message?: string;
          error?: string;
        } | null;
        if (stopped) return;
        if (!res.ok) {
          throw new Error(data?.error || "Could not check the reader");
        }
        if (data?.paid || data?.status === "succeeded") {
          stopped = true;
          callbacks.current.onSuccess(activeOrderId, data.orderNumber);
          return;
        }
        if (data?.status === "failed") {
          stopped = true;
          setMessage(data.message || "The reader could not take the payment.");
          setPhase("error");
        }
      } catch (error) {
        if (stopped) return;
        setMessage(error instanceof Error ? error.message : "Could not check the reader");
        setPhase("error");
      }
    }

    void poll();
    const timer = window.setInterval(() => void poll(), 2000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [open, phase, orderId]);

  async function handleClose() {
    runId.current += 1;
    const activeOrderId = orderIdRef.current;
    if (activeOrderId && (phase === "waiting" || phase === "loading")) {
      try {
        const res = await fetch("/api/checkout/terminal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "cancel", orderId: activeOrderId }),
        });
        const data = (await res.json().catch(() => null)) as {
          paid?: boolean;
          status?: string;
          orderNumber?: string;
        } | null;
        if (data?.paid || data?.status === "succeeded") {
          onSuccess(activeOrderId, data.orderNumber);
          return;
        }
      } catch {
        /* Closing still returns the cashier to the sale. */
      }
    }
    onClose();
  }

  const emailInvalid =
    !skipReceiptEmail &&
    receiptEmail.trim().length > 0 &&
    !isValidReceiptEmail(receiptEmail);

  return (
    <PaySheetFrame
      open={open}
      titleId={titleId}
      descId={descId}
      onDismiss={phase === "waiting" ? undefined : () => void handleClose()}
      dismissDisabled={phase === "waiting"}
    >
      <button
        type="button"
        onClick={() => void handleClose()}
        className="sticky top-0 z-10 ml-auto inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="flex flex-col items-center text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
          {phase === "loading" || phase === "waiting" ? (
            <Loader2 className="h-8 w-8 animate-spin text-slate-600" />
          ) : (
            <Nfc className="h-8 w-8 text-slate-700" />
          )}
        </div>
        <h2 id={titleId} className="text-xl font-semibold text-slate-900">
          Tap to Pay
        </h2>
        <p className="mt-2 text-3xl font-bold text-slate-900">{formatCurrency(amount)}</p>
        <p id={descId} className="mt-3 text-sm text-slate-600">
          {phase === "loading" && "Checking for a Stripe reader…"}
          {phase === "waiting" &&
            `Ask the customer to tap, insert, or swipe on ${reader?.name ?? "the reader"}. This phone is not reading the card.`}
          {(phase === "unavailable" || phase === "error") && message}
        </p>

        {phase === "waiting" && (
          <div className="mt-6 w-full space-y-2 text-left">
            <Label htmlFor="tap-receipt-email">Receipt email (optional)</Label>
            <Input
              id="tap-receipt-email"
              type="email"
              value={receiptEmail}
              onChange={(event) => onReceiptEmailChange(event.target.value)}
              placeholder={defaultReceiptEmail || "customer@example.com"}
              disabled={skipReceiptEmail}
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
                checked={skipReceiptEmail}
                onChange={(event) => onSkipReceiptEmailChange(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              No receipt / skip email
            </label>
          </div>
        )}

        {phase !== "loading" && (
          <div className="mt-8 flex w-full flex-col gap-3">
            {phase !== "waiting" && (
              <Button type="button" size="lg" className="min-h-12 w-full" onClick={onUseCard}>
                Use card
              </Button>
            )}
            <Button
              type="button"
              size="lg"
              variant="outline"
              className="min-h-12 w-full"
              onClick={() => void handleClose()}
            >
              {phase === "waiting" ? "Cancel reader" : "Back to sale"}
            </Button>
          </div>
        )}
      </div>
    </PaySheetFrame>
  );
}
