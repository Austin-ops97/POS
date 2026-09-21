import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { QuickBooksPanel } from "@/components/settings/quickbooks-panel";
import { canConnectQuickBooks } from "@/lib/import/access";
import { quickBooksStatus } from "@/lib/integrations/quickbooks-service";

export const metadata = { title: "QuickBooks" };

export default async function QuickBooksSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const ctx = await requireAuth();
  if (!canConnectQuickBooks(ctx)) redirect("/settings");
  const params = await searchParams;
  const status = await quickBooksStatus(ctx.business.id);
  const notice = params.error ?? (params.connected === "1" ? "QuickBooks connected." : null);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/settings/integrations">
        <Button variant="ghost" size="sm">
          <ChevronLeft className="mr-1 h-4 w-4" />
          Integrations
        </Button>
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">QuickBooks</h1>
        <p className="text-sm text-slate-500">Official Intuit OAuth. EmeraldOne does not scrape QuickBooks and does not write accounting entries back.</p>
      </div>
      <QuickBooksPanel {...status} notice={notice} />
    </div>
  );
}
