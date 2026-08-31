import { SignUp } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { isClerkConfigured } from "@/lib/auth";
import { safeAppRedirect } from "@/lib/employee-invitations";
import { EmeraldWordmark } from "@/components/brand/emerald-mark";

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
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-slate-50 px-6 py-10">
      <EmeraldWordmark size="md" />
      <SignUp
        fallbackRedirectUrl={redirectTo}
        forceRedirectUrl={redirectTo.startsWith("/join/") ? redirectTo : undefined}
        signInUrl={signInUrl}
      />
    </div>
  );
}
