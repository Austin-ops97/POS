import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { isClerkConfigured } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "NexaPOS — Point of sale for the whole store",
  description:
    "Fast retail checkout, inventory, workforce, and expenses. Sign in and unlock everything.",
};

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
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#0b1628]">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <Image
          src="/marketing-hero.svg"
          alt=""
          fill
          priority
          unoptimized
          className="object-cover opacity-90"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0b1628]/95 via-[#0b1628]/75 to-[#0b1628]/40" />
      </div>

      <main className="relative flex flex-1 flex-col justify-center px-6 py-16 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-3xl animate-[fadeRise_0.7s_ease-out_both]">
          <p className="font-[family-name:var(--font-display)] text-5xl font-semibold tracking-tight text-white sm:text-6xl lg:text-7xl">
            NexaPOS
          </p>
          <h1 className="mt-5 max-w-2xl text-balance text-2xl font-medium text-slate-100 sm:text-3xl">
            Point of sale for the whole store.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg">
            Ring up sales, track stock, schedule the team, and run expenses —
            unlocked the moment you sign in.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              asChild
              size="lg"
              className="min-w-[148px] bg-white text-[#0b1628] hover:bg-slate-100"
            >
              <Link href={loginHref}>Log in</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="min-w-[148px] border-slate-400/60 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              <Link href={signupHref}>Sign up</Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
