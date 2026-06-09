/** Demo mode runs without Clerk, Stripe, or PostgreSQL — for prototypes and Vercel previews. */
export function isDemoMode(): boolean {
  return (
    process.env.NEXT_PUBLIC_DEMO_MODE === "true" ||
    !process.env.CLERK_SECRET_KEY ||
    !process.env.DATABASE_URL
  );
}
