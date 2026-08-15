import type { PayPeriodType, PtoLedgerType } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentPayPeriod } from "@/lib/workforce/pay-period";
import { recordPtoLedgerEntry } from "@/lib/workforce/pto-service";
import { planEmployeeAccrual } from "@/lib/workforce/pto-accrual";

const DEFAULT_PAY_PERIOD: PayPeriodType = "BIWEEKLY";
const DEFAULT_WEEK_START = 0;
const BATCH_SIZE = 200;

type LedgerKey = { employeeId: string; type: PtoLedgerType; referenceId: string };

function ledgerKeySet(rows: LedgerKey[]) {
  const set = new Set<string>();
  for (const row of rows) {
    set.add(`${row.employeeId}:${row.type}:${row.referenceId}`);
  }
  return set;
}

export async function runPtoAccrualJob(now = new Date()) {
  let granted = 0;
  let skipped = 0;
  let carryovers = 0;
  let cursor: string | undefined;
  const errors: Array<{ employeeId: string; message: string }> = [];

  for (;;) {
    const employees = await db.employeeProfile.findMany({
      where: {
        status: "ACTIVE",
        deletedAt: null,
        ptoAccrualPolicy: { not: "NONE" },
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      select: {
        id: true,
        businessId: true,
        ptoAccrualPolicy: true,
        ptoAnnualHours: true,
        ptoBalanceHours: true,
        ptoCarryoverLimit: true,
        hireDate: true,
        startDate: true,
        createdAt: true,
        business: {
          select: {
            workforceSettings: {
              select: {
                payPeriodType: true,
                weekStartDay: true,
              },
            },
          },
        },
      },
    });

    if (employees.length === 0) break;
    cursor = employees[employees.length - 1]?.id;

    const ledgers = await db.ptoLedgerEntry.findMany({
      where: {
        employeeId: { in: employees.map((employee) => employee.id) },
        type: { in: ["ACCRUAL", "CARRYOVER"] },
        referenceId: { not: null },
      },
      select: { employeeId: true, type: true, referenceId: true },
    });
    const existing = ledgerKeySet(
      ledgers.flatMap((row) =>
        row.referenceId
          ? [{ employeeId: row.employeeId, type: row.type, referenceId: row.referenceId }]
          : []
      )
    );

    for (const employee of employees) {
      const settings = employee.business.workforceSettings;
      const payPeriodType = settings?.payPeriodType ?? DEFAULT_PAY_PERIOD;
      const weekStartDay = settings?.weekStartDay ?? DEFAULT_WEEK_START;
      const payPeriod = getCurrentPayPeriod(payPeriodType, weekStartDay, now);
      const prefix = `${employee.id}:ACCRUAL:`;
      const existingAccrualKeys = [...existing]
        .filter((key) => key.startsWith(prefix))
        .map((key) => key.slice(prefix.length));

      const plan = planEmployeeAccrual({
        policy: employee.ptoAccrualPolicy,
        annualHours: Number(employee.ptoAnnualHours),
        payPeriodType,
        now,
        hireDate: employee.hireDate,
        startDate: employee.startDate,
        createdAt: employee.createdAt,
        currentBalance: Number(employee.ptoBalanceHours),
        carryoverLimit:
          employee.ptoCarryoverLimit == null ? null : Number(employee.ptoCarryoverLimit),
        existingAccrualKeys,
        payPeriodStart: payPeriod.start,
      });

      if (plan.action === "skip") {
        skipped += 1;
        continue;
      }

      try {
        await db.$transaction(async (tx) => {
          if (plan.carryoverKey && plan.carryoverForfeit > 0) {
            const carryKey = `${employee.id}:CARRYOVER:${plan.carryoverKey}`;
            if (!existing.has(carryKey)) {
              await recordPtoLedgerEntry({
                businessId: employee.businessId,
                employeeId: employee.id,
                type: "CARRYOVER",
                hours: -plan.carryoverForfeit,
                reason: "Annual PTO carryover limit",
                referenceId: plan.carryoverKey,
                tx,
              });
              existing.add(carryKey);
              carryovers += 1;
            }
          }

          await recordPtoLedgerEntry({
            businessId: employee.businessId,
            employeeId: employee.id,
            type: "ACCRUAL",
            hours: plan.hours,
            reason:
              plan.reason === "annual_grant"
                ? "Scheduled annual PTO grant"
                : "Scheduled PTO accrual",
            referenceId: plan.periodKey,
            tx,
          });
        });
        existing.add(`${employee.id}:ACCRUAL:${plan.periodKey}`);
        granted += 1;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          skipped += 1;
          continue;
        }
        errors.push({
          employeeId: employee.id,
          message: error instanceof Error ? error.message : "Unknown accrual error",
        });
      }
    }

    if (employees.length < BATCH_SIZE) break;
  }

  return { granted, skipped, carryovers, errorCount: errors.length, errors };
}
