import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { getBusinessSettings } from "@/lib/queries";
import { ReceiptSettingsForm } from "@/components/dashboard/receipt-settings-form";
import { Button } from "@/components/ui/button";

export default async function ReceiptsSettingsPage() {
  const ctx = await requireAuth();
  const settings = await getBusinessSettings(ctx);

  const receiptSettings = {
    receiptFooter: settings?.receiptFooter ?? "",
    returnPolicy: settings?.returnPolicy ?? "",
    showCashierOnReceipt: settings?.showCashierOnReceipt ?? true,
    showCustomerOnReceipt: settings?.showCustomerOnReceipt ?? true,
    showBusinessEmailOnReceipt: settings?.showBusinessEmailOnReceipt ?? true,
    showBusinessPhoneOnReceipt: settings?.showBusinessPhoneOnReceipt ?? true,
    showSkuOnReceipt: settings?.showSkuOnReceipt ?? false,
    enableReceiptPrinting: settings?.enableReceiptPrinting ?? true,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/settings"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Receipts</h1>
          <p className="text-sm text-slate-500">Customize receipt appearance and content</p>
        </div>
      </div>
      <ReceiptSettingsForm settings={receiptSettings} />
    </div>
  );
}
