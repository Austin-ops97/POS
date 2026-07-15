import { db } from "@/lib/db";

export async function getExpenseSettings(businessId: string) {
  return db.expenseSettings.upsert({
    where: { businessId },
    create: { businessId },
    update: {},
  });
}
