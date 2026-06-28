import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { PaymentsSettings } from "@/components/dashboard/payments-settings";

export default async function PaymentsSettingsPage() {
  await requireAuth();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/settings">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Payments</h1>
          <p className="text-sm text-slate-500">
            Stripe Connect and terminal reader configuration
          </p>
        </div>
      </div>

      <PaymentsSettings />
    </div>
  );
}
