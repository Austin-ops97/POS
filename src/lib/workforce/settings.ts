import { db } from "@/lib/db";
import type { WorkforceSettings } from "@prisma/client";

const DEFAULT_SETTINGS = {
  payPeriodType: "BIWEEKLY" as const,
  weekStartDay: 0,
  overtimeThresholdHours: 40,
  defaultPtoAnnualHours: 80,
};

export async function ensureWorkforceSettings(
  businessId: string
): Promise<WorkforceSettings> {
  const existing = await db.workforceSettings.findUnique({
    where: { businessId },
  });
  if (existing) return existing;

  return db.workforceSettings.create({
    data: { businessId, ...DEFAULT_SETTINGS },
  });
}

export async function getWorkforceSettings(
  businessId: string
): Promise<WorkforceSettings> {
  return ensureWorkforceSettings(businessId);
}
