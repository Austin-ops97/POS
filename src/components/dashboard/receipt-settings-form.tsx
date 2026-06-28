"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { receiptSettingsSchema } from "@/lib/validations";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ReceiptSettings = z.infer<typeof receiptSettingsSchema>;

type ReceiptSettingsFormProps = {
  settings: ReceiptSettings;
};

export function ReceiptSettingsForm({
  settings,
}: ReceiptSettingsFormProps) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { isSubmitting },
  } = useForm<ReceiptSettings>({
    resolver: zodResolver(receiptSettingsSchema),
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

  async function onSubmit(data: ReceiptSettings) {
    try {
      const res = await fetch("/api/business/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiptFooter: data.receiptFooter || undefined,
          showCashierOnReceipt: data.showCashierOnReceipt,
          showCustomerOnReceipt: data.showCustomerOnReceipt,
          showSkuOnReceipt: data.showSkuOnReceipt,
          enableReceiptPrinting: data.enableReceiptPrinting,
        }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        toast.error(err?.error ?? "Failed to save receipt settings");
        return;
      }

      toast.success("Receipt settings saved");
      router.refresh();
    } catch {
      toast.error("Failed to save receipt settings");
    }
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

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Saving..." : "Save Changes"}
      </Button>
    </form>
  );
}
