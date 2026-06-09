import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { ReceiptSettingsForm } from "@/components/dashboard/receipt-settings-form";

export default async function ReceiptsSettingsPage() {
  const ctx = await requireAuth();

  const settings = await db.businessSetting.findUnique({
    where: { businessId: ctx.business.id },
  });

  const receiptSettings = {
    receiptFooter: settings?.receiptFooter ?? null,
    showCashierOnReceipt: settings?.showCashierOnReceipt ?? true,
    showCustomerOnReceipt: settings?.showCustomerOnReceipt ?? true,
    showSkuOnReceipt: settings?.showSkuOnReceipt ?? false,
    enableReceiptPrinting: settings?.enableReceiptPrinting ?? true,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/settings">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Receipt Settings</h1>
          <p className="text-sm text-slate-500">
            Customize receipt content and printing options
          </p>
        </div>
      </div>
      <ReceiptSettingsForm settings={receiptSettings} />
    </div>
  );
}
