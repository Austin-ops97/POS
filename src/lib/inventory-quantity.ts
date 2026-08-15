export const INVENTORY_ADJUST_TYPES = [
  "MANUAL_ADJUSTMENT",
  "DAMAGED",
  "LOST",
  "RECEIVED",
  "RETURN_TO_STOCK",
  "TRANSFER",
] as const;

export type InventoryAdjustType = (typeof INVENTORY_ADJUST_TYPES)[number];

/** Types that always consume on-hand units (user types a positive count). */
const DECREASING_TYPES = new Set<InventoryAdjustType>(["DAMAGED", "LOST"]);

/**
 * Convert a typed unit count into the signed delta the adjust/receive APIs expect.
 * Damaged and lost counts reduce on-hand; everything else adds or transfers a positive count.
 */
export function adjustmentDelta(
  type: InventoryAdjustType,
  units: number
): number {
  if (!Number.isInteger(units) || units === 0) return 0;
  const magnitude = Math.abs(units);
  return DECREASING_TYPES.has(type) ? -magnitude : magnitude;
}

export function clampOnHand(value: number, min = 0, max = 1_000_000): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export function parseQuantityInput(
  raw: string,
  options: { allowNegative?: boolean } = {}
): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const pattern = options.allowNegative ? /^-?\d+$/ : /^\d+$/;
  if (!pattern.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isInteger(parsed) ? parsed : null;
}
