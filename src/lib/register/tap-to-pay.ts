/**
 * Web Tap to Pay resolution.
 *
 * A phone browser cannot complete NFC Tap to Pay. Stripe Terminal server-driven
 * reader APIs can collect card_present on a counter reader (WisePOS E, S700, and
 * other smart readers). Tap to Pay on iPhone needs the native Terminal SDK.
 */

/** Readers that must be driven by a native or Bluetooth Terminal SDK, not this web app. */
const SDK_ONLY_READER_TYPES = new Set([
  "bbpos_chipper2x",
  "bbpos_wisepad3",
  "stripe_m2",
  "mobile_phone_reader",
]);

export const TAP_TO_PAY_UNAVAILABLE_MESSAGE =
  "This browser can't take a contactless tap. Use Card to type a card, or connect a Stripe reader in Settings → Payments. Tap to Pay on iPhone needs the EmeraldOne app.";

export type TerminalReaderChoice = {
  id: string;
  name: string;
  stripeReaderId: string | null;
  status: string;
  deviceType?: string | null;
  isDefault?: boolean;
};

export type TapToPayResolution =
  | { mode: "reader"; reader: TerminalReaderChoice }
  | { mode: "unavailable"; message: string };

export function canDriveReaderFromWeb(deviceType: string | null | undefined) {
  if (!deviceType) return true;
  return !SDK_ONLY_READER_TYPES.has(deviceType);
}

function readerRank(reader: TerminalReaderChoice) {
  if (reader.status === "ONLINE" && reader.isDefault) return 0;
  if (reader.status === "ONLINE") return 1;
  if (reader.isDefault) return 2;
  return 3;
}

export function selectTerminalReader(
  readers: TerminalReaderChoice[]
): TerminalReaderChoice | null {
  let best: TerminalReaderChoice | null = null;
  let bestRank = Number.POSITIVE_INFINITY;

  for (const reader of readers) {
    if (!reader.stripeReaderId) continue;
    if (!canDriveReaderFromWeb(reader.deviceType)) continue;
    const rank = readerRank(reader);
    if (rank < bestRank) {
      best = reader;
      bestRank = rank;
    }
  }

  return best;
}

export function resolveTapToPay(readers: TerminalReaderChoice[]): TapToPayResolution {
  const reader = selectTerminalReader(readers);
  if (reader) return { mode: "reader", reader };
  return { mode: "unavailable", message: TAP_TO_PAY_UNAVAILABLE_MESSAGE };
}

export function isTerminalPaymentIntent(intent: {
  payment_method_types?: string[] | null;
  metadata?: { channel?: string | null } | null;
}) {
  if (intent.metadata?.channel === "terminal") return true;
  return (intent.payment_method_types ?? []).includes("card_present");
}
