import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { handleApiError } from "@/lib/api-utils";
import { receiptSettingsSchema } from "@/lib/validations";

export async function PATCH(request: Request) {
  try {
    const ctx = await requireAuth();
    const body = await request.json();
    const data = receiptSettingsSchema.parse(body);

    const settings = await db.businessSetting.upsert({
      where: { businessId: ctx.business.id },
      create: {
        businessId: ctx.business.id,
        receiptFooter: data.receiptFooter || null,
        returnPolicy: data.returnPolicy || null,
        showCashierOnReceipt: data.showCashierOnReceipt,
        showCustomerOnReceipt: data.showCustomerOnReceipt,
        showBusinessEmailOnReceipt: data.showBusinessEmailOnReceipt,
        showBusinessPhoneOnReceipt: data.showBusinessPhoneOnReceipt,
        showSkuOnReceipt: data.showSkuOnReceipt,
        enableReceiptPrinting: data.enableReceiptPrinting,
      },
      update: {
        receiptFooter: data.receiptFooter || null,
        returnPolicy: data.returnPolicy || null,
        showCashierOnReceipt: data.showCashierOnReceipt,
        showCustomerOnReceipt: data.showCustomerOnReceipt,
        showBusinessEmailOnReceipt: data.showBusinessEmailOnReceipt,
        showBusinessPhoneOnReceipt: data.showBusinessPhoneOnReceipt,
        showSkuOnReceipt: data.showSkuOnReceipt,
        enableReceiptPrinting: data.enableReceiptPrinting,
      },
    });

    return NextResponse.json({
      receiptFooter: settings.receiptFooter,
      returnPolicy: settings.returnPolicy,
      showCashierOnReceipt: settings.showCashierOnReceipt,
      showCustomerOnReceipt: settings.showCustomerOnReceipt,
      showBusinessEmailOnReceipt: settings.showBusinessEmailOnReceipt,
      showBusinessPhoneOnReceipt: settings.showBusinessPhoneOnReceipt,
      showSkuOnReceipt: settings.showSkuOnReceipt,
      enableReceiptPrinting: settings.enableReceiptPrinting,
    });
  } catch (error) {
    return handleApiError(error, "PATCH /api/business/settings");
  }
}
