"use client";

import { useEffect, useState } from "react";

type StripeClientConfig = {
  publishableKey: string;
};

export function useStripeClientConfig(enabled = true) {
  const [config, setConfig] = useState<StripeClientConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadConfig() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/stripe/config");
        const data = (await res.json().catch(() => null)) as {
          publishableKey?: string;
          error?: string;
        } | null;

        if (!res.ok || !data?.publishableKey) {
          throw new Error(
            data?.error ??
              "Stripe publishable key is not configured. Set STRIPE_PUBLISHABLE_KEY in your environment."
          );
        }

        if (!cancelled) {
          setConfig({ publishableKey: data.publishableKey });
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load Stripe configuration"
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadConfig();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { config, error, loading };
}
