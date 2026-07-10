import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export function calculateBusinessDays(startDate: Date, endDate: Date): number {
  let count = 0;
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  while (current <= end) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
}

export function calculateHoursRequested(
  startDate: Date,
  endDate: Date,
  hoursPerDay = 8
): number {
  const days = calculateBusinessDays(startDate, endDate);
  return days * hoursPerDay;
}

export function parseDateOnly(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export async function recordPtoLedgerEntry(params: {
  businessId: string;
  employeeId: string;
  type: "ACCRUAL" | "USAGE" | "ADJUSTMENT" | "CARRYOVER" | "REVERSAL";
  hours: number;
  reason?: string;
  referenceId?: string;
  adjustedById?: string;
  tx?: Prisma.TransactionClient;
}) {
  const client = params.tx ?? db;
  const employee = await client.employeeProfile.findFirst({
    where: { id: params.employeeId, businessId: params.businessId },
    select: { ptoBalanceHours: true },
  });
  if (!employee) throw new Error("Employee not found");

  const current = Number(employee.ptoBalanceHours);
  const next = Math.max(0, current + params.hours);

  await client.employeeProfile.update({
    where: { id: params.employeeId },
    data: { ptoBalanceHours: next },
  });

  return client.ptoLedgerEntry.create({
    data: {
      businessId: params.businessId,
      employeeId: params.employeeId,
      type: params.type,
      hours: params.hours,
      balanceAfter: next,
      reason: params.reason,
      referenceId: params.referenceId,
      adjustedById: params.adjustedById,
    },
  });
}

export async function applyApprovedTimeOff(params: {
  businessId: string;
  employeeId: string;
  hours: number;
  requestId: string;
  adjustedById: string;
  tx: Prisma.TransactionClient;
}) {
  if (params.hours <= 0) return;
  await recordPtoLedgerEntry({
    businessId: params.businessId,
    employeeId: params.employeeId,
    type: "USAGE",
    hours: -params.hours,
    reason: "Approved time off",
    referenceId: params.requestId,
    adjustedById: params.adjustedById,
    tx: params.tx,
  });
}

export async function reverseApprovedTimeOff(params: {
  businessId: string;
  employeeId: string;
  hours: number;
  requestId: string;
  adjustedById: string;
  tx: Prisma.TransactionClient;
}) {
  if (params.hours <= 0) return;
  await recordPtoLedgerEntry({
    businessId: params.businessId,
    employeeId: params.employeeId,
    type: "REVERSAL",
    hours: params.hours,
    reason: "Cancelled approved time off",
    referenceId: params.requestId,
    adjustedById: params.adjustedById,
    tx: params.tx,
  });
}
