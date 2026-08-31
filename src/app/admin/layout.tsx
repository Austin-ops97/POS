import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requirePlatformAdmin();
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-slate-950 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/admin" className="inline-flex items-center gap-2 font-semibold">Platform admin</Link>
          <Link href="/dashboard" className="text-sm text-slate-300 hover:text-white">Open my workspace</Link>
        </div>
      </header>
      <main className="mx-auto max-w-7xl p-6">{children}</main>
    </div>
  );
}
