import Link from "next/link";
import { Button } from "@/components/ui/button";

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white">
            N
          </div>
          <span className="text-lg font-semibold text-slate-900">NexaPOS</span>
        </Link>
        <nav className="hidden items-center gap-8 md:flex">
          <Link href="/features" className="text-sm text-slate-600 hover:text-slate-900">
            Features
          </Link>
          <Link href="/pricing" className="text-sm text-slate-600 hover:text-slate-900">
            Pricing
          </Link>
          <Link href="/industries" className="text-sm text-slate-600 hover:text-slate-900">
            Industries
          </Link>
          <Link href="/hardware" className="text-sm text-slate-600 hover:text-slate-900">
            Hardware
          </Link>
          <Link href="/contact" className="text-sm text-slate-600 hover:text-slate-900">
            Contact
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/sign-in">
            <Button variant="ghost" size="sm">
              Log in
            </Button>
          </Link>
          <Link href="/sign-up">
            <Button size="sm">Start Free Trial</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
