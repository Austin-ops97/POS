# Stripe Terminal and Tap to Pay

This is the current state of in-person card payments in EmeraldOne. It is not a build plan and it does not add a Tap to Pay screen.

## Is Stripe Terminal already in the codebase?

Partly.

- `TerminalReader` is a Prisma model, one row per business and Stripe reader id.
- `GET /api/stripe/terminal` lists readers for the signed-in business and refreshes status from Stripe when that business has a Connect account.
- `POST /api/stripe/terminal` with `action: "register"` creates a Stripe Terminal reader from a registration code and stores it for that business.
- `POST /api/stripe/terminal` with `action: "connection_token"` mints `stripe.terminal.connectionTokens.create` on the connected account.
- Settings → Payments shows Connect status and a Terminal readers list. The list has no registration form, and the register never requests a connection token.

Platform Stripe keys stay in the host environment (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the Connect client id). They are not Builder vault entries.

## Is Tap to Pay on iPhone supported?

No. Nothing in the repo imports the Stripe Terminal JS SDK, the iOS SDK, or the Android SDK. There is no `card_present` PaymentIntent, no reader discovery, and no Apple Tap to Pay entitlement. The product is a Next.js web app.

## What about iPad?

iPad is not supported either. Stripe Tap to Pay on iPhone is an iPhone feature (it does not run on iPad). An iPad cashier would need a Bluetooth or internet reader through the Terminal SDK. That reader path is not connected to checkout.

## What can a cashier do today?

On the register, card payment uses Stripe Elements (`@stripe/react-stripe-js`). The server creates a PaymentIntent on the business's Stripe Connect account with `automatic_payment_methods` and no `card_present` type. The customer types a card into the Payment Element. Cash checkout is separate. A cashier cannot tap a physical card on an iPhone or iPad.

Settings → Payments can show readers that were stored earlier. It does not discover a phone, pair a reader, or take a payment on one.

## What a follow-up phase needs

- A Stripe Terminal client: Terminal JS for a browser reader, or a native iOS app for Tap to Pay on iPhone. Web-only checkout cannot take a phone tap.
- PaymentIntents created as card-present on the connected account, plus the existing connection-token route.
- A Terminal location on the connected account, reader discovery, and a register action that collects on that reader.
- For Tap to Pay on iPhone: Stripe's Tap to Pay approval, an iOS app, the Tap to Pay entitlement, and a device that Stripe supports. iPad stays on a physical reader, not Tap to Pay on iPhone.
- The current webhook already finalizes PaymentIntents that succeed. A card-present intent can reuse that once the register creates one.
