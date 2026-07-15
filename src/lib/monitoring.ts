/**
 * Observability — structured logging + optional Sentry.
 * Set SENTRY_DSN to enable remote error capture.
 */

import * as Sentry from "@sentry/node";

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
      type: "receipt_email_failure";
      businessId: string;
      orderId: string;
      error: string;
    };

let sentryInitialized = false;

function ensureSentry() {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn || sentryInitialized) return Boolean(dsn && sentryInitialized);
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: 0.05,
  });
  sentryInitialized = true;
  return true;
}

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
  if (!ensureSentry()) return;

  if (level === "warning") {
    Sentry.captureMessage(`[${event.type}] ${JSON.stringify(event)}`, "warning");
  } else {
    Sentry.captureException(new Error(`[${event.type}] ${JSON.stringify(event)}`));
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

export function captureException(error: unknown, context?: string): void {
  if (!ensureSentry()) return;
  Sentry.withScope((scope) => {
    if (context) scope.setTag("context", context);
    Sentry.captureException(error);
  });
}
