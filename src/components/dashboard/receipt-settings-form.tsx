"use client";

import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ReceiptSettings = {
  receiptFooter: string | null;
  showCashierOnReceipt: boolean;
  showCustomerOnReceipt: boolean;
  showSkuOnReceipt: boolean;
  enableReceiptPrinting: boolean;
};

export function ReceiptSettingsForm({ settings }: { settings: ReceiptSettings }) {
  const { register, handleSubmit, setValue, watch } = useForm({
    defaultValues: {
      receiptFooter: settings.receiptFooter ?? "",
      showCashierOnReceipt: settings.showCashierOnReceipt,
      showCustomerOnReceipt: settings.showCustomerOnReceipt,
      showSkuOnReceipt: settings.showSkuOnReceipt,
      enableReceiptPrinting: settings.enableReceiptPrinting,
    },
  });

  const showCashier = watch("showCashierOnReceipt");
  const showCustomer = watch("showCustomerOnReceipt");
  const showSku = watch("showSkuOnReceipt");
  const enablePrinting = watch("enableReceiptPrinting");

  function onSubmit(data: Record<string, unknown>) {
    console.log("Save receipt settings:", data);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Receipt Content</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="receiptFooter">Footer Message</Label>
            <Textarea
              id="receiptFooter"
              {...register("receiptFooter")}
              placeholder="Thank you for your business!"
              rows={3}
            />
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Checkbox
                id="showCashier"
                checked={showCashier}
                onCheckedChange={(v) => setValue("showCashierOnReceipt", v === true)}
              />
              <Label htmlFor="showCashier">Show cashier name on receipt</Label>
            </div>
            <div className="flex items-center gap-3">
              <Checkbox
                id="showCustomer"
                checked={showCustomer}
                onCheckedChange={(v) => setValue("showCustomerOnReceipt", v === true)}
              />
              <Label htmlFor="showCustomer">Show customer name on receipt</Label>
            </div>
            <div className="flex items-center gap-3">
              <Checkbox
                id="showSku"
                checked={showSku}
                onCheckedChange={(v) => setValue("showSkuOnReceipt", v === true)}
              />
              <Label htmlFor="showSku">Show SKU on receipt</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Printing</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Checkbox
              id="enablePrinting"
              checked={enablePrinting}
              onCheckedChange={(v) => setValue("enableReceiptPrinting", v === true)}
            />
            <Label htmlFor="enablePrinting">Enable receipt printing</Label>
          </div>
        </CardContent>
      </Card>

      <Button type="submit">Save Changes</Button>
    </form>
  );
}
