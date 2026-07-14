import { db } from "./db";

/**
 * Records a Stripe webhook event for idempotency.
 * Returns false if the event was already processed.
 */
export async function markWebhookEventProcessed(
  eventId: string,
  eventType: string
): Promise<boolean> {
  const existing = await db.stripeWebhookEvent.findUnique({
    where: { id: eventId },
  });
  if (existing) return false;

  try {
    await db.stripeWebhookEvent.create({
      data: { id: eventId, type: eventType },
    });
    return true;
  } catch {
    // Unique constraint race — treat as already processed
    return false;
  }
}
