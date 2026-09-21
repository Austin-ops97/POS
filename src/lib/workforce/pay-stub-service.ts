import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";
import { computePayrollSummary, type PayrollEmployeeRow } from "./payroll-service";
import { parseDateOnly } from "./pto-service";
import { ensureWorkforceSettings } from "./settings";
import {
  buildPayStub,
  maskSensitiveId,
  payStubWhere,
  processBlockReason,
  summarizePayrollTaxes,
  taxPeriodBounds,
  type DatedRule,
  type PaySide,
  type PriorStub,
} from "./pay-stub";
import type { PayStubPdfInput } from "./pay-stub-pdf";

function calendarDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function money(value: Prisma.Decimal | number | null | undefined): number {
  if (value == null) return 0;
  return Number(value);
}

function dayBefore(iso: string): string {
  const date = calendarDate(iso);
  date.setUTCDate(date.getUTCDate() - 1);
  return dateKey(date);
}

function joinParts(parts: Array<string | null | undefined>): string | null {
  const text = parts.map((part) => part?.trim()).filter(Boolean).join(", ");
  return text || null;
}

function hasActivity(row: PayrollEmployeeRow, commission: number, other: number): boolean {
  return (
    row.totalPay !== 0 ||
    row.grossPay !== 0 ||
    row.bonusTotal !== 0 ||
    row.totalHours !== 0 ||
    row.actualHours !== 0 ||
    (row.ptoHours ?? 0) !== 0 ||
    (row.unpaidHours ?? 0) !== 0 ||
    commission !== 0 ||
    other !== 0
  );
}

export type PayStubListItem = {
  id: string;
  payrollRunId: string;
  employeeId: string;
  employeeName: string;
  employeeNumber: string | null;
  payType: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  gross: number;
  net: number;
  employeeTaxes: number;
  employerTaxes: number;
};

export type PayStubDetail = PayStubListItem & {
  employerName: string;
  employerAddress: string | null;
  employerReference: string | null;
  employeeAddress: string | null;
  preTaxDeductions: number;
  taxableWages: number;
  postTaxDeductions: number;
  ytdGross: number;
  ytdDeductions: number;
  ytdEmployeeTaxes: number;
  ytdNet: number;
  ytdEmployerTaxes: number;
  runStatus: "PROCESSED" | "VOID";
  lines: Array<{
    id: string;
    kind: string;
    side: PaySide;
    code: string;
    label: string;
    detail: string | null;
    hours: number | null;
    rate: number | null;
    amount: number;
    ytdAmount: number;
    sortOrder: number;
  }>;
};

export type PayrollRunView = {
  id: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  status: "PROCESSED" | "VOID";
  stubCount: number;
  processedAt: string;
  voidedAt: string | null;
};

export type TaxConfigView = {
  id: string;
  side: PaySide;
  code: string;
  name: string;
  basis: string;
  rate: number;
  wageBase: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  sortOrder: number;
};

export type DeductionConfigView = {
  id: string;
  code: string;
  name: string;
  timing: "PRE_TAX" | "POST_TAX";
  basis: string;
  rate: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  sortOrder: number;
};

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function processPayrollRun(input: {
  businessId: string;
  processedById: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  adjustments?: Array<{ employeeId: string; commission?: number; other?: number }>;
}) {
  const periodStartDate = calendarDate(input.periodStart);
  const periodEndDate = calendarDate(input.periodEnd);
  const existing = await db.payrollRun.findFirst({
    where: {
      businessId: input.businessId,
      periodStart: periodStartDate,
      periodEnd: periodEndDate,
      status: "PROCESSED",
    },
    select: { status: true },
  });
  const blocked = processBlockReason(existing ? "PROCESSED" : null);
  if (blocked) throw new Error(blocked);

  const settings = await ensureWorkforceSettings(input.businessId);
  const calcStart = parseDateOnly(input.periodStart);
  const calcEnd = parseDateOnly(input.periodEnd);
  calcEnd.setHours(23, 59, 59, 999);

  const [business, location, taxConfigs, deductionConfigs, rows] = await Promise.all([
    db.business.findFirst({
      where: { id: input.businessId },
      select: { name: true, legalName: true },
    }),
    db.location.findFirst({
      where: { businessId: input.businessId, deletedAt: null, isActive: true },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: { street: true, city: true, state: true, zip: true },
    }),
    db.payrollTaxConfig.findMany({ where: { businessId: input.businessId } }),
    db.payrollDeductionConfig.findMany({ where: { businessId: input.businessId } }),
    computePayrollSummary({
      businessId: input.businessId,
      periodStart: calcStart,
      periodEnd: calcEnd,
      overtimeThreshold: Number(settings.overtimeThresholdHours),
      overtimeMultiplier: Number(settings.overtimeMultiplier),
      dailyOvertimeThresholdHours:
        settings.dailyOvertimeThresholdHours != null ? Number(settings.dailyOvertimeThresholdHours) : null,
      doubleTimeDailyThresholdHours:
        settings.doubleTimeDailyThresholdHours != null ? Number(settings.doubleTimeDailyThresholdHours) : null,
      doubleTimeMultiplier: Number(settings.doubleTimeMultiplier),
      weekStartDay: settings.weekStartDay,
      payPeriodType: settings.payPeriodType,
      paidBreaks: settings.paidBreaks,
    }),
  ]);
  if (!business) throw new Error("Business not found");

  const adjustmentByEmployee = new Map<string, { commission: number; other: number }>();
  for (const adjustment of input.adjustments ?? []) {
    const current = adjustmentByEmployee.get(adjustment.employeeId) ?? { commission: 0, other: 0 };
    current.commission += adjustment.commission ?? 0;
    current.other += adjustment.other ?? 0;
    adjustmentByEmployee.set(adjustment.employeeId, current);
  }
  const rowIds = new Set(rows.map((row) => row.employeeId));
  for (const employeeId of adjustmentByEmployee.keys()) {
    if (!rowIds.has(employeeId)) throw new Error("Invalid payroll: adjustment employee is not in this business");
  }

  const payable = rows.filter((row) => {
    const extra = adjustmentByEmployee.get(row.employeeId);
    return hasActivity(row, extra?.commission ?? 0, extra?.other ?? 0);
  });
  if (!payable.length) throw new Error("Invalid payroll: nothing to pay for this period");

  const profiles = await db.employeeProfile.findMany({
    where: { businessId: input.businessId, id: { in: payable.map((row) => row.employeeId) } },
    select: {
      id: true,
      employeeNumber: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      stateProvince: true,
      postalCode: true,
      country: true,
    },
  });
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));

  const yearStart = calendarDate(`${input.payDate.slice(0, 4)}-01-01`);
  const priorRows = await db.payStub.findMany({
    where: {
      businessId: input.businessId,
      payDate: { gte: yearStart, lte: calendarDate(input.payDate) },
      periodEnd: { lt: periodStartDate },
      payrollRun: { businessId: input.businessId, status: "PROCESSED" },
    },
    include: { lines: true },
  });
  const priorByEmployee = new Map<string, PriorStub[]>();
  for (const stub of priorRows) {
    const list = priorByEmployee.get(stub.employeeId) ?? [];
    list.push({
      gross: money(stub.gross),
      preTaxDeductions: money(stub.preTaxDeductions),
      employeeTaxes: money(stub.employeeTaxes),
      postTaxDeductions: money(stub.postTaxDeductions),
      net: money(stub.net),
      employerTaxes: money(stub.employerTaxes),
      lines: stub.lines.map((line) => ({
        kind: line.kind,
        side: line.side,
        code: line.code,
        amount: money(line.amount),
        subjectWages: money(line.subjectWages),
      })),
    });
    priorByEmployee.set(stub.employeeId, list);
  }

  const rules: DatedRule[] = [
    ...taxConfigs.map((config) => ({
      id: config.id,
      kind: "TAX" as const,
      side: config.side,
      code: config.code,
      name: config.name,
      basis: config.basis,
      rate: money(config.rate),
      timing: null,
      wageBase: config.wageBase != null ? money(config.wageBase) : null,
      effectiveFrom: dateKey(config.effectiveFrom),
      effectiveTo: config.effectiveTo ? dateKey(config.effectiveTo) : null,
      sortOrder: config.sortOrder,
    })),
    ...deductionConfigs.map((config) => ({
      id: config.id,
      kind: "DEDUCTION" as const,
      side: "EMPLOYEE" as const,
      code: config.code,
      name: config.name,
      basis: config.basis,
      rate: money(config.rate),
      timing: config.timing,
      wageBase: null,
      effectiveFrom: dateKey(config.effectiveFrom),
      effectiveTo: config.effectiveTo ? dateKey(config.effectiveTo) : null,
      sortOrder: config.sortOrder,
    })),
  ];

  const employerName = business.legalName?.trim() || business.name;
  const employerAddress = location
    ? joinParts([location.street, location.city, location.state, location.zip])
    : null;
  const employerReference = maskSensitiveId(settings.employerReference);

  try {
    const run = await db.$transaction(async (tx) => {
      const created = await tx.payrollRun.create({
        data: {
          businessId: input.businessId,
          periodStart: periodStartDate,
          periodEnd: periodEndDate,
          payDate: calendarDate(input.payDate),
          status: "PROCESSED",
          employerName,
          employerAddress,
          employerReference,
          processedById: input.processedById,
        },
      });
      for (const row of payable) {
        const extra = adjustmentByEmployee.get(row.employeeId) ?? { commission: 0, other: 0 };
        const draft = buildPayStub({
          earnings: {
            payType: row.payType,
            hourlyRate: row.hourlyWage,
            regularHours: row.regularHours,
            regularPay: row.regularPay,
            overtimeHours: row.overtimeHours,
            overtimePay: row.overtimePay,
            doubleTimeHours: row.doubleTimeHours,
            doubleTimePay: row.doubleTimePay,
            ptoHours: row.ptoHours ?? 0,
            sickHours: row.sickHours ?? 0,
            vacationHours: row.vacationHours ?? 0,
            holidayHours: row.holidayHours ?? 0,
            unpaidHours: row.unpaidHours ?? 0,
            bonus: row.bonusTotal,
            commission: extra.commission,
            other: extra.other,
          },
          rules,
          prior: priorByEmployee.get(row.employeeId) ?? [],
          payDate: input.payDate,
        });
        const profile = profileById.get(row.employeeId);
        await tx.payStub.create({
          data: {
            businessId: input.businessId,
            payrollRunId: created.id,
            employeeId: row.employeeId,
            employeeName: row.employeeName,
            employeeNumber: maskSensitiveId(profile?.employeeNumber),
            employeeAddress: profile
              ? joinParts([
                  [profile.addressLine1, profile.addressLine2].filter(Boolean).join(" "),
                  profile.city,
                  profile.stateProvince,
                  profile.postalCode,
                  profile.country,
                ])
              : null,
            payType: row.payType,
            periodStart: periodStartDate,
            periodEnd: periodEndDate,
            payDate: calendarDate(input.payDate),
            gross: draft.gross,
            preTaxDeductions: draft.preTaxDeductions,
            taxableWages: draft.taxableWages,
            employeeTaxes: draft.employeeTaxes,
            postTaxDeductions: draft.postTaxDeductions,
            net: draft.net,
            employerTaxes: draft.employerTaxes,
            ytdGross: draft.ytdGross,
            ytdDeductions: draft.ytdDeductions,
            ytdEmployeeTaxes: draft.ytdEmployeeTaxes,
            ytdNet: draft.ytdNet,
            ytdEmployerTaxes: draft.ytdEmployerTaxes,
            lines: {
              create: draft.lines.map((line) => ({
                businessId: input.businessId,
                kind: line.kind,
                side: line.side,
                code: line.code,
                label: line.label,
                detail: line.detail,
                hours: line.hours,
                rate: line.rate,
                amount: line.amount,
                subjectWages: line.subjectWages,
                ytdAmount: line.ytdAmount,
                sortOrder: line.sortOrder,
              })),
            },
          },
        });
      }
      return created;
    });

    const grossTotal = payable.reduce((sum, row) => {
      const extra = adjustmentByEmployee.get(row.employeeId);
      return sum + row.grossPay + row.bonusTotal + (extra?.commission ?? 0) + (extra?.other ?? 0);
    }, 0);
    await createAuditLog({
      businessId: input.businessId,
      employeeId: input.processedById,
      action: "WORKFORCE_CHANGE",
      entity: "PayrollRun",
      entityId: run.id,
      details: {
        kind: "PAYROLL_PROCESSED",
        payrollRunId: run.id,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        payDate: input.payDate,
        stubCount: payable.length,
        grossTotal: Math.round(grossTotal * 100) / 100,
      },
    });
    return { id: run.id, stubCount: payable.length, periodStart: input.periodStart, periodEnd: input.periodEnd, payDate: input.payDate };
  } catch (error) {
    if (isUniqueConflict(error)) {
      throw new Error("Invalid payroll: this pay period already has processed pay stubs");
    }
    throw error;
  }
}

export async function voidPayrollRun(input: { businessId: string; payrollRunId: string; employeeId: string }) {
  const run = await db.payrollRun.findFirst({
    where: { id: input.payrollRunId, businessId: input.businessId },
  });
  if (!run) throw new Error("Payroll run not found");
  if (run.status !== "PROCESSED") throw new Error("Invalid payroll: only a processed run can be voided");
  await db.payrollRun.update({
    where: { id: run.id },
    data: { status: "VOID", voidedAt: new Date() },
  });
  await createAuditLog({
    businessId: input.businessId,
    employeeId: input.employeeId,
    action: "WORKFORCE_CHANGE",
    entity: "PayrollRun",
    entityId: run.id,
    details: {
      kind: "PAYROLL_VOID",
      payrollRunId: run.id,
      periodStart: dateKey(run.periodStart),
      periodEnd: dateKey(run.periodEnd),
      payDate: dateKey(run.payDate),
    },
  });
  return { id: run.id, status: "VOID" as const };
}

export async function listPayrollRuns(businessId: string): Promise<PayrollRunView[]> {
  const runs = await db.payrollRun.findMany({
    where: { businessId },
    orderBy: [{ payDate: "desc" }, { processedAt: "desc" }],
    take: 36,
    include: { _count: { select: { stubs: true } } },
  });
  return runs.map((run) => ({
    id: run.id,
    periodStart: dateKey(run.periodStart),
    periodEnd: dateKey(run.periodEnd),
    payDate: dateKey(run.payDate),
    status: run.status,
    stubCount: run._count.stubs,
    processedAt: run.processedAt.toISOString(),
    voidedAt: run.voidedAt ? run.voidedAt.toISOString() : null,
  }));
}

export async function listPayStubs(input: {
  businessId: string;
  employeeId?: string;
  payrollRunId?: string;
  from?: string;
  to?: string;
}): Promise<PayStubListItem[]> {
  const stubs = await db.payStub.findMany({
    where: payStubWhere(input),
    orderBy: [{ payDate: "desc" }, { employeeName: "asc" }],
    take: 200,
  });
  return stubs.map((stub) => ({
    id: stub.id,
    payrollRunId: stub.payrollRunId,
    employeeId: stub.employeeId,
    employeeName: stub.employeeName,
    employeeNumber: stub.employeeNumber,
    payType: stub.payType,
    periodStart: dateKey(stub.periodStart),
    periodEnd: dateKey(stub.periodEnd),
    payDate: dateKey(stub.payDate),
    gross: money(stub.gross),
    net: money(stub.net),
    employeeTaxes: money(stub.employeeTaxes),
    employerTaxes: money(stub.employerTaxes),
  }));
}

export async function getPayStub(businessId: string, id: string): Promise<PayStubDetail | null> {
  const stub = await db.payStub.findFirst({
    where: { id, businessId, payrollRun: { businessId } },
    include: {
      lines: { orderBy: { sortOrder: "asc" } },
      payrollRun: true,
    },
  });
  if (!stub || stub.payrollRun.businessId !== businessId) return null;
  return {
    id: stub.id,
    payrollRunId: stub.payrollRunId,
    employeeId: stub.employeeId,
    employeeName: stub.employeeName,
    employeeNumber: stub.employeeNumber,
    payType: stub.payType,
    periodStart: dateKey(stub.periodStart),
    periodEnd: dateKey(stub.periodEnd),
    payDate: dateKey(stub.payDate),
    gross: money(stub.gross),
    net: money(stub.net),
    employeeTaxes: money(stub.employeeTaxes),
    employerTaxes: money(stub.employerTaxes),
    employerName: stub.payrollRun.employerName,
    employerAddress: stub.payrollRun.employerAddress,
    employerReference: stub.payrollRun.employerReference,
    employeeAddress: stub.employeeAddress,
    preTaxDeductions: money(stub.preTaxDeductions),
    taxableWages: money(stub.taxableWages),
    postTaxDeductions: money(stub.postTaxDeductions),
    ytdGross: money(stub.ytdGross),
    ytdDeductions: money(stub.ytdDeductions),
    ytdEmployeeTaxes: money(stub.ytdEmployeeTaxes),
    ytdNet: money(stub.ytdNet),
    ytdEmployerTaxes: money(stub.ytdEmployerTaxes),
    runStatus: stub.payrollRun.status,
    lines: stub.lines.map((line) => ({
      id: line.id,
      kind: line.kind,
      side: line.side,
      code: line.code,
      label: line.label,
      detail: line.detail,
      hours: line.hours != null ? money(line.hours) : null,
      rate: line.rate != null ? money(line.rate) : null,
      amount: money(line.amount),
      ytdAmount: money(line.ytdAmount),
      sortOrder: line.sortOrder,
    })),
  };
}

export function payStubPdfInput(stub: PayStubDetail): PayStubPdfInput {
  return {
    employerName: stub.employerName,
    employerAddress: stub.employerAddress,
    employerReference: stub.employerReference,
    employeeName: stub.employeeName,
    employeeNumber: stub.employeeNumber,
    employeeAddress: stub.employeeAddress,
    payType: stub.payType,
    periodStart: stub.periodStart,
    periodEnd: stub.periodEnd,
    payDate: stub.payDate,
    stub: {
      lines: stub.lines.map((line) => ({
        kind: line.kind as PayStubPdfInput["stub"]["lines"][number]["kind"],
        side: line.side,
        code: line.code,
        label: line.label,
        detail: line.detail,
        hours: line.hours,
        rate: line.rate,
        amount: line.amount,
        subjectWages: 0,
        ytdAmount: line.ytdAmount,
        sortOrder: line.sortOrder,
      })),
      gross: stub.gross,
      preTaxDeductions: stub.preTaxDeductions,
      taxableWages: stub.taxableWages,
      employeeTaxes: stub.employeeTaxes,
      postTaxDeductions: stub.postTaxDeductions,
      net: stub.net,
      employerTaxes: stub.employerTaxes,
      ytdGross: stub.ytdGross,
      ytdDeductions: stub.ytdDeductions,
      ytdEmployeeTaxes: stub.ytdEmployeeTaxes,
      ytdNet: stub.ytdNet,
      ytdEmployerTaxes: stub.ytdEmployerTaxes,
    },
  };
}

export async function recordPayStubDownload(input: { businessId: string; employeeId: string; stubId: string; payrollRunId: string }) {
  await createAuditLog({
    businessId: input.businessId,
    employeeId: input.employeeId,
    action: "WORKFORCE_CHANGE",
    entity: "PayStub",
    entityId: input.stubId,
    details: { kind: "PAY_STUB_GENERATED", payrollRunId: input.payrollRunId },
  });
}

function narrower(bound: string | undefined, explicit: string | undefined, direction: "from" | "to"): string | undefined {
  if (!bound) return explicit;
  if (!explicit) return bound;
  return direction === "from" ? (explicit > bound ? explicit : bound) : explicit < bound ? explicit : bound;
}

export async function getPayrollTaxSummary(input: {
  businessId: string;
  year?: string;
  quarter?: string;
  month?: string;
  from?: string;
  to?: string;
  payrollRunId?: string;
  employeeId?: string;
  taxType?: string;
}) {
  const bounds = taxPeriodBounds({ year: input.year, quarter: input.quarter, month: input.month });
  if (bounds.error) throw new Error(bounds.error);
  const from = narrower(bounds.from, input.from, "from");
  const to = narrower(bounds.to, input.to, "to");
  const lines = await db.payStubLine.findMany({
    where: {
      businessId: input.businessId,
      kind: { in: ["TAX", "EMPLOYER_TAX"] },
      ...(input.taxType ? { code: input.taxType } : {}),
      payStub: {
        businessId: input.businessId,
        ...(input.employeeId ? { employeeId: input.employeeId } : {}),
        ...(input.payrollRunId ? { payrollRunId: input.payrollRunId } : {}),
        ...(from || to
          ? {
              payDate: {
                ...(from ? { gte: calendarDate(from) } : {}),
                ...(to ? { lte: calendarDate(to) } : {}),
              },
            }
          : {}),
        payrollRun: { businessId: input.businessId, status: "PROCESSED" },
      },
    },
    select: { side: true, code: true, label: true, amount: true },
  });
  const summary = summarizePayrollTaxes(
    lines.map((line) => ({
      side: line.side,
      code: line.code,
      label: line.label,
      amount: money(line.amount),
    }))
  );
  return { ...summary, from: from ?? null, to: to ?? null, lineCount: lines.length };
}

async function closeOpenTaxVersion(input: {
  businessId: string;
  side: PaySide;
  code: string;
  effectiveFrom: string;
}) {
  const open = await db.payrollTaxConfig.findMany({
    where: {
      businessId: input.businessId,
      side: input.side,
      code: input.code,
      effectiveTo: null,
    },
  });
  for (const rule of open) {
    const start = dateKey(rule.effectiveFrom);
    if (start >= input.effectiveFrom) {
      throw new Error("Invalid tax config: an open rule already starts on or after this date");
    }
    const end = dayBefore(input.effectiveFrom);
    if (end < start) throw new Error("Invalid tax config: the previous version cannot be closed before it starts");
    await db.payrollTaxConfig.update({
      where: { id: rule.id },
      data: { effectiveTo: calendarDate(end) },
    });
  }
}

async function closeOpenDeductionVersion(input: { businessId: string; code: string; effectiveFrom: string }) {
  const open = await db.payrollDeductionConfig.findMany({
    where: { businessId: input.businessId, code: input.code, effectiveTo: null },
  });
  for (const rule of open) {
    const start = dateKey(rule.effectiveFrom);
    if (start >= input.effectiveFrom) {
      throw new Error("Invalid deduction config: an open rule already starts on or after this date");
    }
    const end = dayBefore(input.effectiveFrom);
    if (end < start) throw new Error("Invalid deduction config: the previous version cannot be closed before it starts");
    await db.payrollDeductionConfig.update({
      where: { id: rule.id },
      data: { effectiveTo: calendarDate(end) },
    });
  }
}

export async function listTaxConfigs(businessId: string): Promise<TaxConfigView[]> {
  const rows = await db.payrollTaxConfig.findMany({
    where: { businessId },
    orderBy: [{ code: "asc" }, { effectiveFrom: "desc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    side: row.side,
    code: row.code,
    name: row.name,
    basis: row.basis,
    rate: money(row.rate),
    wageBase: row.wageBase != null ? money(row.wageBase) : null,
    effectiveFrom: dateKey(row.effectiveFrom),
    effectiveTo: row.effectiveTo ? dateKey(row.effectiveTo) : null,
    sortOrder: row.sortOrder,
  }));
}

export async function createTaxConfig(input: {
  businessId: string;
  employeeId: string;
  side: PaySide;
  code: string;
  name: string;
  basis: "PERCENT_OF_GROSS" | "PERCENT_OF_TAXABLE" | "FLAT";
  rate: number;
  wageBase?: number | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
  sortOrder?: number;
}) {
  await closeOpenTaxVersion(input);
  const created = await db.payrollTaxConfig.create({
    data: {
      businessId: input.businessId,
      side: input.side,
      code: input.code,
      name: input.name,
      basis: input.basis,
      rate: input.rate,
      wageBase: input.wageBase ?? null,
      effectiveFrom: calendarDate(input.effectiveFrom),
      effectiveTo: input.effectiveTo ? calendarDate(input.effectiveTo) : null,
      sortOrder: input.sortOrder ?? 0,
    },
  });
  await createAuditLog({
    businessId: input.businessId,
    employeeId: input.employeeId,
    action: "WORKFORCE_CHANGE",
    entity: "PayrollTaxConfig",
    entityId: created.id,
    details: {
      kind: "TAX_CONFIG_CHANGED",
      action: "CREATE",
      side: input.side,
      code: input.code,
      basis: input.basis,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo ?? null,
    },
  });
  return created.id;
}

export async function endTaxConfig(input: { businessId: string; employeeId: string; id: string; effectiveTo: string }) {
  const config = await db.payrollTaxConfig.findFirst({ where: { id: input.id, businessId: input.businessId } });
  if (!config) throw new Error("Tax config not found");
  if (input.effectiveTo < dateKey(config.effectiveFrom)) {
    throw new Error("Invalid tax config: effective end is before the start date");
  }
  await db.payrollTaxConfig.update({
    where: { id: config.id },
    data: { effectiveTo: calendarDate(input.effectiveTo) },
  });
  await createAuditLog({
    businessId: input.businessId,
    employeeId: input.employeeId,
    action: "WORKFORCE_CHANGE",
    entity: "PayrollTaxConfig",
    entityId: config.id,
    details: { kind: "TAX_CONFIG_CHANGED", action: "END", code: config.code, side: config.side, effectiveTo: input.effectiveTo },
  });
}

export async function listDeductionConfigs(businessId: string): Promise<DeductionConfigView[]> {
  const rows = await db.payrollDeductionConfig.findMany({
    where: { businessId },
    orderBy: [{ code: "asc" }, { effectiveFrom: "desc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    timing: row.timing,
    basis: row.basis,
    rate: money(row.rate),
    effectiveFrom: dateKey(row.effectiveFrom),
    effectiveTo: row.effectiveTo ? dateKey(row.effectiveTo) : null,
    sortOrder: row.sortOrder,
  }));
}

export async function createDeductionConfig(input: {
  businessId: string;
  employeeId: string;
  code: string;
  name: string;
  timing: "PRE_TAX" | "POST_TAX";
  basis: "PERCENT_OF_GROSS" | "PERCENT_OF_TAXABLE" | "FLAT";
  rate: number;
  effectiveFrom: string;
  effectiveTo?: string | null;
  sortOrder?: number;
}) {
  await closeOpenDeductionVersion(input);
  const created = await db.payrollDeductionConfig.create({
    data: {
      businessId: input.businessId,
      code: input.code,
      name: input.name,
      timing: input.timing,
      basis: input.basis,
      rate: input.rate,
      effectiveFrom: calendarDate(input.effectiveFrom),
      effectiveTo: input.effectiveTo ? calendarDate(input.effectiveTo) : null,
      sortOrder: input.sortOrder ?? 0,
    },
  });
  await createAuditLog({
    businessId: input.businessId,
    employeeId: input.employeeId,
    action: "WORKFORCE_CHANGE",
    entity: "PayrollDeductionConfig",
    entityId: created.id,
    details: {
      kind: "TAX_CONFIG_CHANGED",
      action: "CREATE",
      configKind: "DEDUCTION",
      code: input.code,
      timing: input.timing,
      basis: input.basis,
      effectiveFrom: input.effectiveFrom,
    },
  });
  return created.id;
}

export async function endDeductionConfig(input: { businessId: string; employeeId: string; id: string; effectiveTo: string }) {
  const config = await db.payrollDeductionConfig.findFirst({ where: { id: input.id, businessId: input.businessId } });
  if (!config) throw new Error("Deduction config not found");
  if (input.effectiveTo < dateKey(config.effectiveFrom)) {
    throw new Error("Invalid deduction config: effective end is before the start date");
  }
  await db.payrollDeductionConfig.update({
    where: { id: config.id },
    data: { effectiveTo: calendarDate(input.effectiveTo) },
  });
  await createAuditLog({
    businessId: input.businessId,
    employeeId: input.employeeId,
    action: "WORKFORCE_CHANGE",
    entity: "PayrollDeductionConfig",
    entityId: config.id,
    details: { kind: "TAX_CONFIG_CHANGED", action: "END", configKind: "DEDUCTION", code: config.code, effectiveTo: input.effectiveTo },
  });
}
