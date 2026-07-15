import { redirect } from "next/navigation";

/** Honest product surface — pricing lives in-product after sign-in (no plans/paywalls). */
export default function PricingPage() {
  redirect("/");
}
