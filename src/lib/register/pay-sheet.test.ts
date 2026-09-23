import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { twMerge } from "tailwind-merge";
import { readChargeCardDetails } from "./card-charge-details";
import {
  CART_OVERLAY_Z_INDEX,
  CART_SHEET_Z_INDEX,
  mobileCartSheetClassName,
  payActionPlacement,
  payDialogStacksAboveCart,
  payFooterClassName,
  PAY_DIALOG_Z_INDEX,
} from "./pay-sheet";
import {
  isTerminalPaymentIntent,
  resolveTapToPay,
  selectTerminalReader,
  TAP_TO_PAY_UNAVAILABLE_MESSAGE,
  type TerminalReaderChoice,
} from "./tap-to-pay";

const wisePos: TerminalReaderChoice = {
  id: "r-wise",
  name: "Front counter",
  stripeReaderId: "tmr_wise",
  status: "ONLINE",
  deviceType: "bbpos_wisepos_e",
};

describe("pay sheet stacking", () => {
  it("keeps payment dialogs above the cart sheet and the cart above its backdrop", () => {
    assert.equal(payDialogStacksAboveCart(), true);
    assert.ok(PAY_DIALOG_Z_INDEX > CART_SHEET_Z_INDEX);
    assert.ok(CART_SHEET_Z_INDEX > CART_OVERLAY_Z_INDEX);
  });

  it("uses a full-viewport mobile cart with no rounded overlay gap", () => {
    const className = mobileCartSheetClassName();
    assert.match(className, /inset-0/);
    assert.match(className, /h-dvh/);
    assert.match(className, /max-h-none/);
    assert.match(className, /rounded-none/);
    assert.match(className, /z-\[60\]/);
    const merged = twMerge("fixed z-50 flex flex-col bg-white", className);
    assert.match(merged, /z-\[60\]/);
    assert.doesNotMatch(merged, /\bz-50\b/);
  });

  it("pins pay actions in a footer above the safe area", () => {
    const className = payFooterClassName();
    assert.match(className, /shrink-0/);
    assert.match(className, /safe-area-inset-bottom/);
    const placement = payActionPlacement();
    assert.deepEqual(
      placement.map((action) => action.id),
      ["cash", "card", "tap"]
    );
    assert.equal(placement.find((action) => action.id === "tap")?.className, "col-span-2");
  });
});

describe("tap to pay resolution", () => {
  it("starts a server-driven reader when one is configured", () => {
    const resolution = resolveTapToPay([
      {
        id: "offline",
        name: "Back room",
        stripeReaderId: "tmr_off",
        status: "OFFLINE",
        deviceType: "stripe_s700",
        isDefault: true,
      },
      wisePos,
    ]);
    assert.equal(resolution.mode, "reader");
    if (resolution.mode === "reader") {
      assert.equal(resolution.reader.id, wisePos.id);
    }
  });

  it("prefers the default online reader", () => {
    const selected = selectTerminalReader([
      { ...wisePos, isDefault: false },
      {
        id: "default",
        name: "Default",
        stripeReaderId: "tmr_default",
        status: "ONLINE",
        deviceType: "stripe_s700",
        isDefault: true,
      },
    ]);
    assert.equal(selected?.id, "default");
  });

  it("does not pretend a phone browser can tap a card", () => {
    const phoneOnly = resolveTapToPay([
      {
        id: "phone",
        name: "iPhone",
        stripeReaderId: "tmr_phone",
        status: "ONLINE",
        deviceType: "mobile_phone_reader",
      },
    ]);
    assert.deepEqual(phoneOnly, {
      mode: "unavailable",
      message: TAP_TO_PAY_UNAVAILABLE_MESSAGE,
    });

    const noReaders = resolveTapToPay([]);
    assert.equal(noReaders.mode, "unavailable");
    assert.match(noReaders.mode === "unavailable" ? noReaders.message : "", /Use Card/);
    assert.match(
      noReaders.mode === "unavailable" ? noReaders.message : "",
      /EmeraldOne app/
    );
  });

  it("skips Bluetooth readers and still uses a smart reader", () => {
    const selected = selectTerminalReader([
      {
        id: "m2",
        name: "M2",
        stripeReaderId: "tmr_m2",
        status: "ONLINE",
        deviceType: "stripe_m2",
      },
      { ...wisePos, status: "OFFLINE" },
    ]);
    assert.equal(selected?.id, wisePos.id);
  });

  it("allows a reader whose device type has not been synced yet", () => {
    const selected = selectTerminalReader([
      {
        id: "unknown",
        name: "Reader",
        stripeReaderId: "tmr_unknown",
        status: "ONLINE",
        deviceType: null,
      },
    ]);
    assert.equal(selected?.stripeReaderId, "tmr_unknown");
  });

  it("keeps card-present intents out of the typed-card Payment Element", () => {
    assert.equal(
      isTerminalPaymentIntent({
        payment_method_types: ["card_present"],
        metadata: { channel: "terminal" },
      }),
      true
    );
    assert.equal(
      isTerminalPaymentIntent({
        payment_method_types: ["card", "link"],
        metadata: {},
      }),
      false
    );
  });
});

describe("card charge details", () => {
  it("reads last4 from a tapped card and from a typed card", () => {
    assert.deepEqual(
      readChargeCardDetails({
        card_present: { last4: "4242", brand: "visa" },
      }),
      { cardLast4: "4242", cardBrand: "visa" }
    );
    assert.deepEqual(
      readChargeCardDetails({
        card: { last4: "1111", brand: "mastercard" },
      }),
      { cardLast4: "1111", cardBrand: "mastercard" }
    );
  });
});
