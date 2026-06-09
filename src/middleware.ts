import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/features(.*)",
  "/pricing(.*)",
  "/industries(.*)",
  "/hardware(.*)",
  "/contact(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
  "/dashboard(.*)",
  "/register(.*)",
  "/products(.*)",
  "/inventory(.*)",
  "/orders(.*)",
  "/customers(.*)",
  "/employees(.*)",
  "/reports(.*)",
  "/settings(.*)",
  "/onboarding(.*)",
  "/api(.*)",
]);

function isDemoMode(): boolean {
  return (
    process.env.NEXT_PUBLIC_DEMO_MODE === "true" ||
    !process.env.CLERK_SECRET_KEY
  );
}

const clerkHandler = clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export default function middleware(req: NextRequest) {
  if (isDemoMode()) {
    return NextResponse.next();
  }
  return clerkHandler(req, {} as never);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
