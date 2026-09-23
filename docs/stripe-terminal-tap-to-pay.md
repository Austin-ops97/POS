# Stripe Terminal and Tap to Pay

The register offers three tenders: Cash, Card (typed card in the Payment Element), and Tap to Pay.

## What the web register can do

Tap to Pay starts a Stripe Terminal **server-driven** payment when the business has a Connect account and a smart reader (WisePOS E, Reader S700 / S710, supported Verifone readers, or a simulated reader):

1. `GET /api/checkout/terminal` lists readers for a cashier (`process_sale`). It does not require the Settings permission used by `GET /api/stripe/terminal`.
2. `POST /api/checkout/terminal` with `action: "start"` creates a Connect PaymentIntent with `payment_method_types: ["card_present"]` and `metadata.channel: "terminal"`, then calls `terminal.readers.processPaymentIntent`.
3. The register polls `action: "status"` until the reader collects the card. Success reuses `finalizeSuccessfulCardPayment`, the same path as a typed card and the `payment_intent.succeeded` webhook.
4. `action: "cancel"` calls `terminal.readers.cancelAction`.

Typed Card checkout is unchanged. It still creates an `automatic_payment_methods` PaymentIntent and confirms it with Stripe Elements. A card-present intent is never handed to the Payment Element.

`POST /api/stripe/terminal` with `action: "connection_token"` is still available for a future Terminal SDK client. The web register does not use a connection token, because server-driven readers do not need one.

## What a phone browser cannot do

Safari and Chrome cannot take an NFC tap. Tap to Pay on iPhone needs Stripe's Terminal iOS SDK, Apple's Tap to Pay entitlement, and Stripe's approval. iPad is not a Tap to Pay device; it needs a counter reader.

If no web-drivable reader is configured, or the only reader is a phone or Bluetooth reader (`mobile_phone_reader`, M2, Chipper, WisePad), the Tap to Pay button stays on screen and explains that:

- use Card to type a card, or
- connect a Stripe reader in Settings → Payments, and
- Tap to Pay on iPhone needs the EmeraldOne app.

The button does not pretend the phone read a card.

## Follow-up for Tap to Pay on iPhone

A native iOS app still has to:

- obtain Stripe Tap to Pay approval and the Apple entitlement
- embed the Terminal iOS SDK and discover the local `mobile_phone_reader`
- mint a connection token from `POST /api/stripe/terminal` (`action: "connection_token"`) on the connected account
- collect a `card_present` PaymentIntent and let the existing webhook finalize it

Until that app exists, in-person taps go through a configured Terminal reader.
