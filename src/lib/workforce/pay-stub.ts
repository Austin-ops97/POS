import type { Prisma } from "@prisma/client";

export type PaySide = "EMPLOYEE" | "EMPLOYER";
export type AmountBasis = "PERCENT_OF_GROSS" | "PERCENT_OF_TAXABLE" | "FLAT";
export type DeductionTiming = "PRE_TAX" | "POST_TAX";

export type DatedRule = {
  id: string;
  kind: "TAX" | "DEDUCTION";
  side: PaySide;
  code: string;
  name: string;
  basis: AmountBasis;
  rate: number;
  timing: DeductionTiming | null;
  wageBase: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  sortOrder: number;
};

export type EarningSource = {
  payType: string;
  hourlyRate: number;
  regularHours: number;
  regularPay: number;
  overtimeHours: number;
  overtimePay: number;
  doubleTimeHours: number;
  doubleTimePay: number;
  ptoHours: number;
  sickHours: number;
  vacationHours: number;
  holidayHours: number;
  unpaidHours: number;
  bonus: number;
  commission: number;
  other: number;
};

export type PriorStub = {
  gross: number;
  preTaxDeductions: number;
  employeeTaxes: number;
  postTaxDeductions: number;
  net: number;
  employerTaxes: number;
  lines: Array<{ kind: string; side: PaySide; code: string; amount: number; subjectWages: number }>;
};

export type StubLineDraft = {
  kind: "EARNING" | "TAX" | "DEDUCTION" | "EMPLOYER_TAX";
  side: PaySide;
  code: string;
  label: string;
  detail: string | null;
  hours: number | null;
  rate: number | null;
  amount: number;
  subjectWages: number;
  ytdAmount: number;
  sortOrder: number;
};

export type PayStubDraft = {
  lines: StubLineDraft[];
  gross: number;
  preTaxDeductions: number;
  taxableWages: number;
  employeeTaxes: number;
  postTaxDeductions: number;
  net: number;
  employerTaxes: number;
  ytdGross: number;
  ytdDeductions: number;
  ytdEmployeeTaxes: number;
  ytdNet: number;
  ytdEmployerTaxes: number;
};

function cents(value: number): number {
  return Math.round(value * 100);
}

function money(centsValue: number): number {
  return centsValue / 100;
}

function moneyOf(value: number): number {
  return money(cents(value));
}

/** Mask a value that looks like a Social Security number. EINs (##-#######) stay visible. */
export function maskSensitiveId(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{3}-\d{2}-\d{4}$/.test(trimmed)) return `***-**-${trimmed.slice(-4)}`;
  if (/^\d{9}$/.test(trimmed)) return `***-**-${trimmed.slice(-4)}`;
  return trimmed;
}

export function processBlockReason(existingStatus: "PROCESSED" | "VOID" | null): string | null {
  if (existingStatus === "PROCESSED") {
    return "Invalid payroll: this pay period already has processed pay stubs";
  }
  return null;
}

export function rulesEffectiveOn<T extends { effectiveFrom: string; effectiveTo: string | null; kind: string; side: string; code: string }>(
  rules: T[],
  payDate: string
): T[] {
  const eligible = rules.filter(
    (rule) => rule.effectiveFrom <= payDate && (rule.effectiveTo == null || rule.effectiveTo >= payDate)
  );
  const best = new Map<string, T>();
  for (const rule of eligible) {
    const key = `${rule.kind}:${rule.side}:${rule.code}`;
    const current = best.get(key);
    if (!current || rule.effectiveFrom > current.effectiveFrom) best.set(key, rule);
  }
  return [...best.values()].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
}

export function payStubWhere(input: {
  businessId: string;
  employeeId?: string;
  payrollRunId?: string;
  from?: string;
  to?: string;
}): Prisma.PayStubWhereInput {
  return {
    businessId: input.businessId,
    ...(input.employeeId ? { employeeId: input.employeeId } : {}),
    ...(input.payrollRunId ? { payrollRunId: input.payrollRunId } : {}),
    ...(input.from || input.to
      ? {
          payDate: {
            ...(input.from ? { gte: new Date(`${input.from}T00:00:00.000Z`) } : {}),
            ...(input.to ? { lte: new Date(`${input.to}T00:00:00.000Z`) } : {}),
          },
        }
      : {}),
    payrollRun: { businessId: input.businessId, status: "PROCESSED" },
  };
}

function earning(code: string, label: string, hours: number | null, rate: number | null, amount: number, sortOrder: number): StubLineDraft {
  return {
    kind: "EARNING",
    side: "EMPLOYEE",
    code,
    label,
    detail: null,
    hours,
    rate,
    amount: moneyOf(amount),
    subjectWages: 0,
    ytdAmount: 0,
    sortOrder,
  };
}

export function buildEarningLines(source: EarningSource): StubLineDraft[] {
  const lines: StubLineDraft[] = [];
  const rate = source.hourlyRate;
  if (source.payType === "SALARY") {
    lines.push(earning("SALARY", "Salary", source.regularHours, null, source.regularPay, 0));
  } else {
    const paidLeaveHours = source.ptoHours + source.sickHours + source.vacationHours + source.holidayHours;
    const leavePay = moneyOf(paidLeaveHours * rate);
    const regularEarnings = moneyOf(source.regularPay - leavePay);
    lines.push(earning("REGULAR", "Regular", source.regularHours, rate, Math.max(0, regularEarnings), 0));
    if (source.ptoHours) lines.push(earning("PTO", "PTO", source.ptoHours, rate, source.ptoHours * rate, 1));
    if (source.sickHours) lines.push(earning("SICK", "Sick", source.sickHours, rate, source.sickHours * rate, 2));
    if (source.vacationHours) lines.push(earning("VACATION", "Vacation", source.vacationHours, rate, source.vacationHours * rate, 3));
    if (source.holidayHours) lines.push(earning("HOLIDAY", "Holiday", source.holidayHours, rate, source.holidayHours * rate, 4));
  }
  if (source.overtimeHours || source.overtimePay) {
    lines.push(earning("OT", "Overtime", source.overtimeHours, source.overtimeHours ? moneyOf(source.overtimePay / source.overtimeHours) : null, source.overtimePay, 5));
  }
  if (source.doubleTimeHours || source.doubleTimePay) {
    lines.push(earning("DOUBLE", "Double time", source.doubleTimeHours, source.doubleTimeHours ? moneyOf(source.doubleTimePay / source.doubleTimeHours) : null, source.doubleTimePay, 6));
  }
  if (source.unpaidHours) lines.push(earning("UNPAID", "Unpaid time", source.unpaidHours, 0, 0, 7));
  if (source.bonus) lines.push(earning("BONUS", "Bonus", null, null, source.bonus, 8));
  if (source.commission) lines.push(earning("COMMISSION", "Commission", null, null, source.commission, 9));
  if (source.other) lines.push(earning("OTHER", "Other earnings", null, null, source.other, 10));
  return lines.filter((line) => line.amount !== 0 || (line.hours ?? 0) !== 0);
}

function priorAmount(prior: PriorStub[], kind: string, side: PaySide, code: string, field: "amount" | "subjectWages"): number {
  return prior.reduce(
    (sum, stub) =>
      sum +
      stub.lines
        .filter((line) => line.kind === kind && line.side === side && line.code === code)
        .reduce((lineSum, line) => lineSum + line[field], 0),
    0
  );
}

function ruleAmount(rule: DatedRule, gross: number, taxable: number, priorSubject: number): { amount: number; subject: number } {
  if (rule.basis === "FLAT") return { amount: moneyOf(rule.rate), subject: 0 };
  let subject = rule.basis === "PERCENT_OF_GROSS" ? gross : taxable;
  if (rule.wageBase != null) {
    const room = Math.max(0, rule.wageBase - priorSubject);
    subject = Math.min(subject, room);
  }
  const subjectCents = cents(subject);
  return { amount: money(Math.round(subjectCents * rule.rate)), subject: money(subjectCents) };
}

function detailFor(rule: DatedRule): string {
  if (rule.basis === "FLAT") return "Flat amount";
  const percent = `${(rule.rate * 100).toFixed(2)}%`;
  const base = rule.basis === "PERCENT_OF_GROSS" ? "gross" : "taxable wages";
  return rule.wageBase != null ? `${percent} of ${base}, wage base ${rule.wageBase.toFixed(2)}` : `${percent} of ${base}`;
}

export function buildPayStub(input: { earnings: EarningSource; rules: DatedRule[]; prior: PriorStub[]; payDate: string }): PayStubDraft {
  const active = rulesEffectiveOn(input.rules, input.payDate);
  const earnings = buildEarningLines(input.earnings);
  const gross = moneyOf(earnings.reduce((sum, line) => sum + line.amount, 0));
  const deductions = active.filter((rule) => rule.kind === "DEDUCTION");
  const preTax = deductions.filter((rule) => rule.timing !== "POST_TAX");
  const postTax = deductions.filter((rule) => rule.timing === "POST_TAX");
  const preLines: StubLineDraft[] = [];
  let preTaxCents = 0;
  for (const rule of preTax) {
    const priced = ruleAmount(rule, gross, gross, priorAmount(input.prior, "DEDUCTION", "EMPLOYEE", rule.code, "subjectWages"));
    preTaxCents += cents(priced.amount);
    preLines.push({
      kind: "DEDUCTION",
      side: "EMPLOYEE",
      code: rule.code,
      label: rule.name,
      detail: detailFor(rule),
      hours: null,
      rate: rule.rate,
      amount: priced.amount,
      subjectWages: priced.subject,
      ytdAmount: 0,
      sortOrder: 20 + rule.sortOrder,
    });
  }
  const preTaxDeductions = money(preTaxCents);
  const taxableWages = money(Math.max(0, cents(gross) - preTaxCents));
  const taxLines: StubLineDraft[] = [];
  let employeeTaxCents = 0;
  let employerTaxCents = 0;
  for (const rule of active.filter((item) => item.kind === "TAX")) {
    const priced = ruleAmount(rule, gross, taxableWages, priorAmount(input.prior, rule.side === "EMPLOYER" ? "EMPLOYER_TAX" : "TAX", rule.side, rule.code, "subjectWages"));
    const line: StubLineDraft = {
      kind: rule.side === "EMPLOYER" ? "EMPLOYER_TAX" : "TAX",
      side: rule.side,
      code: rule.code,
      label: rule.name,
      detail: detailFor(rule),
      hours: null,
      rate: rule.rate,
      amount: priced.amount,
      subjectWages: priced.subject,
      ytdAmount: 0,
      sortOrder: (rule.side === "EMPLOYER" ? 60 : 40) + rule.sortOrder,
    };
    taxLines.push(line);
    if (rule.side === "EMPLOYER") employerTaxCents += cents(priced.amount);
    else employeeTaxCents += cents(priced.amount);
  }
  const postLines: StubLineDraft[] = [];
  let postTaxCents = 0;
  for (const rule of postTax) {
    const priced = ruleAmount(rule, gross, taxableWages, priorAmount(input.prior, "DEDUCTION", "EMPLOYEE", rule.code, "subjectWages"));
    postTaxCents += cents(priced.amount);
    postLines.push({
      kind: "DEDUCTION",
      side: "EMPLOYEE",
      code: rule.code,
      label: rule.name,
      detail: detailFor(rule),
      hours: null,
      rate: rule.rate,
      amount: priced.amount,
      subjectWages: priced.subject,
      ytdAmount: 0,
      sortOrder: 80 + rule.sortOrder,
    });
  }
  const employeeTaxes = money(employeeTaxCents);
  const postTaxDeductions = money(postTaxCents);
  const employerTaxes = money(employerTaxCents);
  const net = money(cents(gross) - preTaxCents - employeeTaxCents - postTaxCents);
  const priorGross = input.prior.reduce((sum, stub) => sum + stub.gross, 0);
  const priorPre = input.prior.reduce((sum, stub) => sum + stub.preTaxDeductions, 0);
  const priorPost = input.prior.reduce((sum, stub) => sum + stub.postTaxDeductions, 0);
  const priorEmployee = input.prior.reduce((sum, stub) => sum + stub.employeeTaxes, 0);
  const priorNet = input.prior.reduce((sum, stub) => sum + stub.net, 0);
  const priorEmployer = input.prior.reduce((sum, stub) => sum + stub.employerTaxes, 0);
  const lines = [...earnings, ...preLines, ...taxLines, ...postLines].map((line) => ({
    ...line,
    ytdAmount: moneyOf(line.amount + priorAmount(input.prior, line.kind, line.side, line.code, "amount")),
  }));
  return {
    lines,
    gross,
    preTaxDeductions,
    taxableWages,
    employeeTaxes,
    postTaxDeductions,
    net,
    employerTaxes,
    ytdGross: moneyOf(priorGross + gross),
    ytdDeductions: moneyOf(priorPre + priorPost + preTaxDeductions + postTaxDeductions),
    ytdEmployeeTaxes: moneyOf(priorEmployee + employeeTaxes),
    ytdNet: moneyOf(priorNet + net),
    ytdEmployerTaxes: moneyOf(priorEmployer + employerTaxes),
  };
}

export function taxPeriodBounds(filters: {
  year?: string | null;
  quarter?: string | null;
  month?: string | null;
}): { from?: string; to?: string; error?: string } {
  const year = filters.year?.trim() || "";
  const quarter = filters.quarter?.trim() || "";
  const month = filters.month?.trim() || "";
  if (!year && !quarter && !month) return {};
  if (!/^\d{4}$/.test(year)) return { error: "Invalid payroll report: year must be YYYY" };
  if (quarter && month) return { error: "Invalid payroll report: choose a month or a quarter" };
  if (quarter) {
    const quarterNumber = Number(quarter);
    if (![1, 2, 3, 4].includes(quarterNumber)) return { error: "Invalid payroll report: quarter must be 1-4" };
    const startMonth = (quarterNumber - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    const endDay = new Date(Date.UTC(Number(year), endMonth, 0)).getUTCDate();
    return {
      from: `${year}-${String(startMonth).padStart(2, "0")}-01`,
      to: `${year}-${String(endMonth).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`,
    };
  }
  if (month) {
    const monthNumber = Number(month);
    if (monthNumber < 1 || monthNumber > 12) return { error: "Invalid payroll report: month must be 1-12" };
    const endDay = new Date(Date.UTC(Number(year), monthNumber, 0)).getUTCDate();
    return {
      from: `${year}-${String(monthNumber).padStart(2, "0")}-01`,
      to: `${year}-${String(monthNumber).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`,
    };
  }
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

export function summarizePayrollTaxes(
  lines: Array<{ side: PaySide; code: string; label: string; amount: number; employeeId?: string }>
) {
  const byType = new Map<string, { side: PaySide; code: string; label: string; amount: number }>();
  for (const line of lines) {
    const key = `${line.side}:${line.code}`;
    const current = byType.get(key) ?? { side: line.side, code: line.code, label: line.label, amount: 0 };
    current.amount = moneyOf(current.amount + line.amount);
    byType.set(key, current);
  }
  const rows = [...byType.values()];
  const employeeWithholding = moneyOf(rows.filter((row) => row.side === "EMPLOYEE").reduce((sum, row) => sum + row.amount, 0));
  const employerTaxes = moneyOf(rows.filter((row) => row.side === "EMPLOYER").reduce((sum, row) => sum + row.amount, 0));
  return {
    employeeWithholding,
    employerTaxes,
    totalPayrollTax: moneyOf(employeeWithholding + employerTaxes),
    byType: rows,
  };
}
