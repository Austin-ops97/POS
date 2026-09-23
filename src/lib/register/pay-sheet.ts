/**
 * Mobile register stacking.
 *
 * The Current Sale sheet is portaled to document.body. Pay dialogs that stay
 * inside the dashboard column (z-0) render underneath that sheet, so the navy
 * cart looks like a blue overlay the cashier must close before Cash, Card, or
 * Tap to Pay will accept a tap. Pay dialogs are portaled above the cart, and
 * the cart content sits above its own backdrop.
 */
export const CART_OVERLAY_Z_INDEX = 50;
export const CART_SHEET_Z_INDEX = 60;
export const PAY_DIALOG_Z_INDEX = 80;

/** Matches the `lg` breakpoint where the inline cart replaces the mobile sheet. */
export const MOBILE_CART_MEDIA_QUERY = "(max-width: 1023px)";

export function payDialogStacksAboveCart() {
  return (
    PAY_DIALOG_Z_INDEX > CART_SHEET_Z_INDEX &&
    CART_SHEET_Z_INDEX > CART_OVERLAY_Z_INDEX
  );
}

/** Full-viewport cart. No partial bottom sheet and no rounded gap for a backdrop. */
export function mobileCartSheetClassName() {
  return "inset-0 z-[60] h-dvh max-h-none w-full rounded-none border-0";
}

/**
 * Pay actions sit in a non-scrolling footer, above the home indicator.
 * `shrink-0` keeps a long cart from pushing Cash / Card / Tap to Pay off screen.
 */
export function payFooterClassName() {
  return "shrink-0 px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]";
}

export type PayActionId = "cash" | "card" | "tap";

/** Cash and Card share a row. Tap to Pay stays on its own full-width row. */
export function payActionPlacement(): Array<{ id: PayActionId; className: string }> {
  return [
    { id: "cash", className: "col-span-1" },
    { id: "card", className: "col-span-1" },
    { id: "tap", className: "col-span-2" },
  ];
}
