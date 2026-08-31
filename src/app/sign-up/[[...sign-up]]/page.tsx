import { SignUp } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { isClerkConfigured } from "@/lib/auth";
import { safeAppRedirect } from "@/lib/employee-invitations";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>;
}) {
  if (!isClerkConfigured()) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const redirectTo = safeAppRedirect(params.redirect_url) ?? "/dashboard";
  const signInUrl =
    redirectTo === "/dashboard"
      ? "/sign-in"
      : `/sign-in?redirect_url=${encodeURIComponent(redirectTo)}`;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <SignUp
        fallbackRedirectUrl={redirectTo}
        forceRedirectUrl={redirectTo.startsWith("/join/") ? redirectTo : undefined}
        signInUrl={signInUrl}
      />
    </div>
  );
}
