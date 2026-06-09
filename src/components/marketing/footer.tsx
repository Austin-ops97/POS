import Link from "next/link";

export function MarketingFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white">
                N
              </div>
              <span className="font-semibold">NexaPOS</span>
            </div>
            <p className="mt-4 text-sm text-slate-500">
              A cleaner, smarter POS for modern businesses.
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-900">Product</h4>
            <ul className="mt-4 space-y-2">
              <li><Link href="/features" className="text-sm text-slate-500 hover:text-slate-900">Features</Link></li>
              <li><Link href="/pricing" className="text-sm text-slate-500 hover:text-slate-900">Pricing</Link></li>
              <li><Link href="/hardware" className="text-sm text-slate-500 hover:text-slate-900">Hardware</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-900">Industries</h4>
            <ul className="mt-4 space-y-2">
              <li><Link href="/industries" className="text-sm text-slate-500 hover:text-slate-900">Retail</Link></li>
              <li><Link href="/industries" className="text-sm text-slate-500 hover:text-slate-900">Services</Link></li>
              <li><Link href="/industries" className="text-sm text-slate-500 hover:text-slate-900">Rentals</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-900">Company</h4>
            <ul className="mt-4 space-y-2">
              <li><Link href="/contact" className="text-sm text-slate-500 hover:text-slate-900">Contact</Link></li>
              <li><Link href="/sign-up" className="text-sm text-slate-500 hover:text-slate-900">Start Free Trial</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-12 border-t border-slate-200 pt-8 text-center text-sm text-slate-500">
          &copy; {new Date().getFullYear()} NexaPOS. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
