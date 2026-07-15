import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
  "/api/health",
]);

function isClerkConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
      process.env.CLERK_SECRET_KEY
  );
}

function allowDevAuthBypass() {
  return (
    !isClerkConfigured() &&
    process.env.ALLOW_DEV_AUTH_BYPASS === "true" &&
    process.env.NODE_ENV !== "production"
  );
}

const clerkAuthMiddleware = clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export default function middleware(request: NextRequest, event: NextFetchEvent) {
  if (!isClerkConfigured()) {
    // Fail closed unless an explicit local-only bypass is enabled.
    if (!allowDevAuthBypass() && !isPublicRoute(request)) {
      if (request.nextUrl.pathname.startsWith("/api/")) {
        return NextResponse.json(
          {
            error:
              "Authentication is not configured. Set Clerk keys or ALLOW_DEV_AUTH_BYPASS=true for local development.",
          },
          { status: 503 }
        );
      }
      return NextResponse.redirect(new URL("/sign-in", request.url));
    }
    return NextResponse.next();
  }

  return clerkAuthMiddleware(request, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/__clerk/:path*",
    "/(api|trpc)(.*)",
  ],
};
