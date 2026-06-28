"use client";

import { useMemo, useState } from "react";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe, type StripeElementsOptions } from "@stripe/stripe-js";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getStripePublishableKey } from "@/lib/stripe-client";
import { formatCurrency } from "@/lib/utils";

type CardPaymentCheckoutProps = {
  clientSecret: string;
  stripeAccountId: string;
  amount: number;
  orderId: string;
  onSuccess: (orderNumber?: string) => void;
  onError: (message: string) => void;
  onCancel: () => void;
};

function CardPaymentForm({
  amount,
  orderId,
  onSuccess,
  onError,
  onCancel,
}: Omit<CardPaymentCheckoutProps, "clientSecret" | "stripeAccountId">) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: "if_required",
      });

      if (error) {
        onError(error.message ?? "Card payment failed");
        return;
      }

      if (paymentIntent?.status !== "succeeded") {
        onError("Payment was not completed. Please try again.");
        return;
      }

      const confirmRes = await fetch("/api/checkout/payment/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });

      if (!confirmRes.ok) {
        const err = (await confirmRes.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(err?.error ?? "Failed to finalize payment");
      }

      const data = (await confirmRes.json()) as { orderNumber?: string };
      onSuccess(data.orderNumber);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Card payment failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />
      <div className="flex gap-3 pt-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          disabled={submitting}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button type="submit" className="flex-1" disabled={!stripe || submitting}>
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            `Pay ${formatCurrency(amount)}`
          )}
        </Button>
      </div>
    </form>
  );
}

export function CardPaymentCheckout({
  clientSecret,
  stripeAccountId,
  amount,
  orderId,
  onSuccess,
  onError,
  onCancel,
}: CardPaymentCheckoutProps) {
  const publishableKey = getStripePublishableKey();

  const stripePromise = useMemo(() => {
    if (!publishableKey) return null;
    return loadStripe(publishableKey, {
      stripeAccount: stripeAccountId,
    });
  }, [publishableKey, stripeAccountId]);

  const options: StripeElementsOptions = useMemo(
    () => ({
      clientSecret,
      appearance: {
        theme: "stripe",
        variables: {
          colorPrimary: "#0f172a",
        },
      },
    }),
    [clientSecret]
  );

  if (!publishableKey || !stripePromise) {
    return (
      <p className="text-sm text-red-600">
        Card payments are not configured. Set{" "}
        <code className="text-xs">NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> in
        your environment.
      </p>
    );
  }

  return (
    <Elements stripe={stripePromise} options={options}>
      <CardPaymentForm
        amount={amount}
        orderId={orderId}
        onSuccess={onSuccess}
        onError={onError}
        onCancel={onCancel}
      />
    </Elements>
  );
}
