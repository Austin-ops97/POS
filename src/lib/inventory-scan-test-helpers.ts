/**
 * Pure helpers extracted for unit tests without importing Prisma-backed modules.
 * Keep in sync with src/lib/inventory-scan.ts computeProposedDelta / movementTypeForMode.
 */

export type InventoryScanMode = "RECEIVE" | "CYCLE_COUNT" | "DAMAGED" | "LOST";

export function computeProposedDeltaForTest(
  mode: InventoryScanMode,
  expectedQty: number,
  scannedQty: number
): number {
  switch (mode) {
    case "RECEIVE":
      return scannedQty;
    case "CYCLE_COUNT":
      return scannedQty - expectedQty;
    case "DAMAGED":
    case "LOST":
      return -Math.abs(scannedQty);
    default:
      return 0;
  }
}

export function movementTypeForModeForTest(
  mode: InventoryScanMode
): "RECEIVED" | "MANUAL_ADJUSTMENT" | "DAMAGED" | "LOST" {
  switch (mode) {
    case "RECEIVE":
      return "RECEIVED";
    case "CYCLE_COUNT":
      return "MANUAL_ADJUSTMENT";
    case "DAMAGED":
      return "DAMAGED";
    case "LOST":
      return "LOST";
  }
}
