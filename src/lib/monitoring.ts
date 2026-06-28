/**
 * Observability abstraction — structured logging today, Sentry-ready tomorrow.
 * Set SENTRY_DSN to enable future Sentry integration without changing call sites.
 */

export type MonitoringEvent =
  | {
      type: "webhook_failure";
      eventId: string;
      eventType: string;
      error: string;
    }
  | {
      type: "webhook_duplicate";
      eventId: string;
      eventType: string;
    }
  | {
      type: "subscription_load_fallback";
      businessId: string;
      error: string;
      environment: string;
    }
  | {
      type: "billing_checkout_failure";
      businessId: string;
      plan?: string;
      error: string;
    }
  | {
      type: "billing_portal_failure";
      businessId: string;
      error: string;
    }
  | {
      type: "receipt_email_failure";
      businessId: string;
      orderId: string;
      error: string;
    };

function toLogPayload(event: MonitoringEvent): Record<string, unknown> {
  return {
    ...event,
    timestamp: new Date().toISOString(),
    service: "nexapos",
  };
}

/** Hook for external error trackers (Sentry, Datadog, etc.). */
export function reportToExternalMonitor(
  event: MonitoringEvent,
  level: "warning" | "error" = "error"
): void {
  const sentryDsn = process.env.SENTRY_DSN?.trim();
  if (!sentryDsn) return;

  // Placeholder for Sentry SDK — keeps call sites stable until SDK is installed.
  if (process.env.NODE_ENV === "development") {
    console.debug("[monitoring] Sentry DSN set but SDK not installed:", level, event.type);
  }
}

export function captureMonitoringEvent(
  event: MonitoringEvent,
  level: "warning" | "error" = "error"
): void {
  const payload = toLogPayload(event);
  const line = JSON.stringify(payload);

  if (level === "warning") {
    console.warn(`[monitoring] ${line}`);
  } else {
    console.error(`[monitoring] ${line}`);
  }

  reportToExternalMonitor(event, level);
}
