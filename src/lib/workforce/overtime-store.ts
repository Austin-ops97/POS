import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { PayrollEmployeeRow } from "./payroll-service";

export async function saveOvertimeCalculations(params: {
  businessId: string;
  periodStart: Date;
  periodEnd: Date;
  rows: PayrollEmployeeRow[];
}) {
  await db.$transaction(
    params.rows.map((row) =>
      db.overtimeCalculation.upsert({
        where: {
          employeeId_periodStart_periodEnd: {
            employeeId: row.employeeId,
            periodStart: params.periodStart,
            periodEnd: params.periodEnd,
          },
        },
        create: {
          businessId: params.businessId,
          employeeId: row.employeeId,
          periodStart: params.periodStart,
          periodEnd: params.periodEnd,
          regularHours: row.regularHours,
          overtimeHours: row.overtimeHours,
          doubleTimeHours: row.doubleTimeHours,
          totalHours: row.totalHours,
          regularPay: row.regularPay,
          overtimePay: row.overtimePay,
          doubleTimePay: row.doubleTimePay,
          grossPay: row.grossPay,
          rules: row.overtimeRules as unknown as Prisma.InputJsonValue,
        },
        update: {
          regularHours: row.regularHours,
          overtimeHours: row.overtimeHours,
          doubleTimeHours: row.doubleTimeHours,
          totalHours: row.totalHours,
          regularPay: row.regularPay,
          overtimePay: row.overtimePay,
          doubleTimePay: row.doubleTimePay,
          grossPay: row.grossPay,
          rules: row.overtimeRules as unknown as Prisma.InputJsonValue,
          calculatedAt: new Date(),
        },
      })
    )
  );
}
