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

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <div className="mx-auto w-full max-w-md text-center">
          <div className="mb-8 flex items-center justify-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-lg font-bold text-white">
              N
            </div>
            <span className="text-2xl font-semibold tracking-tight text-slate-900">
              NexaPOS
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Run your business from one place.
          </h1>
          <p className="mt-4 text-base text-slate-600">
            Point of sale, inventory, and team tools for your store.
          </p>
          <div className="mt-10">
            <Link href={loginHref}>
              <Button size="lg" className="min-w-[140px]">
                Log In
              </Button>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
