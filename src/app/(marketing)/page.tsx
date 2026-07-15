import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { isClerkConfigured } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export default async function HomePage() {
  if (isClerkConfigured()) {
    const { userId } = await auth();
    if (userId) {
      redirect("/dashboard");
    }
  }

  const loginHref = isClerkConfigured() ? "/sign-in" : "/dashboard";
  const signupHref = isClerkConfigured() ? "/sign-up" : "/dashboard";

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-slate-950">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#1e3a5f_0%,_transparent_55%),linear-gradient(180deg,#0f172a_0%,#020617_100%)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.12)_1px,transparent_1px)] [background-size:48px_48px]"
        aria-hidden="true"
      />

      <main className="relative flex flex-1 flex-col items-center justify-center px-6 py-16">
        <div className="mx-auto w-full max-w-lg text-center">
          <div className="mb-8 flex items-center justify-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-xl font-bold text-slate-900">
              N
            </div>
            <span className="text-3xl font-semibold tracking-tight text-white">
              NexaPOS
            </span>
          </div>
          <h1 className="text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Point of sale for the whole store.
          </h1>
          <p className="mx-auto mt-4 max-w-md text-base text-slate-300">
            Checkout, inventory, and team tools in one place — unlock everything when you sign in.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="min-w-[140px] bg-white text-slate-900 hover:bg-slate-100">
              <Link href={loginHref}>Log in</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="min-w-[140px] border-slate-500 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              <Link href={signupHref}>Sign up</Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
