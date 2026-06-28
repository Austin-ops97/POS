import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-utils";
import { requireAuth } from "@/lib/auth";
import { ensurePaidSubscription } from "@/lib/subscription-server";
import { getStripePublishableKey } from "@/lib/stripe";

export async function GET() {
  try {
    const ctx = await requireAuth();
    await ensurePaidSubscription(ctx);

    const publishableKey = getStripePublishableKey();
    if (!publishableKey) {
      return NextResponse.json(
        {
          error:
            "Stripe publishable key is not configured. Set STRIPE_PUBLISHABLE_KEY in your environment.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json({ publishableKey });
  } catch (error) {
    return handleApiError(error, "GET /api/stripe/config");
  }
}
