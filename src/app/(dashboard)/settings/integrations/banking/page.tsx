import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { BankingPanel } from "@/components/settings/banking-panel";
import { canConnectBank } from "@/lib/banking/access";
import { bankConnectionStatus } from "@/lib/banking/plaid-service";

export const metadata = { title: "Banking" };

export default async function BankingSettingsPage() {
  const ctx = await requireAuth();
  if (!canConnectBank(ctx)) redirect("/settings");
  const status = await bankConnectionStatus(ctx.business.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/settings/integrations">
        <Button variant="ghost" size="sm">
          <ChevronLeft className="mr-1 h-4 w-4" />
          Integrations
        </Button>
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Banking</h1>
        <p className="text-sm text-slate-500">
          Plaid hosts the bank sign-in. EmeraldOne stores an encrypted access token, account ids, and synced transactions. It never asks for a bank password.
        </p>
      </div>
      <BankingPanel {...status} />
    </div>
  );
}
