import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPayStub,
  maskSensitiveId,
  payStubWhere,
  processBlockReason,
  rulesEffectiveOn,
  summarizePayrollTaxes,
  taxPeriodBounds,
  type DatedRule,
  type EarningSource,
} from "./pay-stub";

const earnings: EarningSource = {
  payType: "HOURLY",
  hourlyRate: 20,
  regularHours: 40,
  regularPay: 840,
  overtimeHours: 2,
  overtimePay: 60,
  doubleTimeHours: 0,
  doubleTimePay: 0,
  ptoHours: 2,
  sickHours: 0,
  vacationHours: 0,
  holidayHours: 0,
  unpaidHours: 0,
  bonus: 50,
  commission: 25,
  other: 0,
};

const rules: DatedRule[] = [
  {
    id: "retire",
    kind: "DEDUCTION",
    side: "EMPLOYEE",
    code: "RETIREMENT",
    name: "Retirement",
    basis: "PERCENT_OF_GROSS",
    rate: 0.05,
    timing: "PRE_TAX",
    wageBase: null,
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    sortOrder: 1,
  },
  {
    id: "fed",
    kind: "TAX",
    side: "EMPLOYEE",
    code: "FEDERAL",
    name: "Federal withholding",
    basis: "PERCENT_OF_TAXABLE",
    rate: 0.1,
    timing: null,
    wageBase: null,
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    sortOrder: 1,
  },
  {
    id: "ss-ee",
    kind: "TAX",
    side: "EMPLOYEE",
    code: "SOCIAL_SECURITY",
    name: "Social Security",
    basis: "PERCENT_OF_TAXABLE",
    rate: 0.062,
    timing: null,
    wageBase: 1000,
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    sortOrder: 2,
  },
  {
    id: "ss-er",
    kind: "TAX",
    side: "EMPLOYER",
    code: "SOCIAL_SECURITY",
    name: "Employer Social Security",
    basis: "PERCENT_OF_TAXABLE",
    rate: 0.062,
    timing: null,
    wageBase: null,
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    sortOrder: 1,
  },
  {
    id: "ins",
    kind: "DEDUCTION",
    side: "EMPLOYEE",
    code: "INSURANCE",
    name: "Insurance",
    basis: "FLAT",
    rate: 40,
    timing: "POST_TAX",
    wageBase: null,
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    sortOrder: 1,
  },
];

describe("pay stub math", () => {
  it("splits regular, PTO, overtime, bonus, and commission without a second engine", () => {
    const stub = buildPayStub({ earnings, rules: [], prior: [], payDate: "2026-09-15" });
    const regular = stub.lines.find((line) => line.code === "REGULAR");
    const pto = stub.lines.find((line) => line.code === "PTO");
    const overtime = stub.lines.find((line) => line.code === "OT");
    assert.equal(regular?.amount, 800);
    assert.equal(pto?.amount, 40);
    assert.equal(overtime?.hours, 2);
    assert.equal(overtime?.amount, 60);
    assert.equal(stub.gross, 975);
    assert.equal(stub.net, 975);
  });

  it("separates employee withholding from employer tax and computes net", () => {
    const stub = buildPayStub({ earnings, rules, prior: [], payDate: "2026-09-15" });
    assert.equal(stub.gross, 975);
    assert.equal(stub.preTaxDeductions, 48.75);
    assert.equal(stub.taxableWages, 926.25);
    assert.equal(stub.employeeTaxes, 150.06);
    assert.equal(stub.postTaxDeductions, 40);
    assert.equal(stub.employerTaxes, 57.43);
    assert.equal(stub.net, 736.19);
    assert.equal(stub.net + stub.preTaxDeductions + stub.employeeTaxes + stub.postTaxDeductions, stub.gross);
  });

  it("stops Social Security at the wage base using prior subject wages", () => {
    const stub = buildPayStub({
      earnings,
      rules,
      prior: [
        {
          gross: 900,
          preTaxDeductions: 0,
          employeeTaxes: 55.8,
          postTaxDeductions: 0,
          net: 844.2,
          employerTaxes: 0,
          lines: [{ kind: "TAX", side: "EMPLOYEE", code: "SOCIAL_SECURITY", amount: 55.8, subjectWages: 900 }],
        },
      ],
      payDate: "2026-09-15",
    });
    const social = stub.lines.find((line) => line.kind === "TAX" && line.code === "SOCIAL_SECURITY");
    assert.equal(social?.subjectWages, 100);
    assert.equal(social?.amount, 6.2);
    assert.equal(stub.ytdGross, 1875);
    assert.ok(stub.ytdNet > stub.net);
  });

  it("keeps a processed snapshot when a later tax rate changes", () => {
    const originalRules = rules.map((rule) => ({ ...rule }));
    const processed = buildPayStub({ earnings, rules: originalRules, prior: [], payDate: "2026-09-15" });
    const stored = structuredClone(processed);
    originalRules.find((rule) => rule.code === "FEDERAL")!.rate = 0.2;
    const next = buildPayStub({ earnings, rules: originalRules, prior: [], payDate: "2026-09-15" });
    assert.notEqual(next.employeeTaxes, stored.employeeTaxes);
    assert.equal(processed.employeeTaxes, stored.employeeTaxes);
    assert.equal(processed.lines.find((line) => line.code === "FEDERAL")?.amount, stored.lines.find((line) => line.code === "FEDERAL")?.amount);
  });

  it("uses the rule version effective on the pay date", () => {
    const versioned = rulesEffectiveOn(
      [
        { ...rules[1], id: "old", rate: 0.1, effectiveFrom: "2026-01-01", effectiveTo: "2026-06-30" },
        { ...rules[1], id: "new", rate: 0.12, effectiveFrom: "2026-07-01", effectiveTo: null },
      ],
      "2026-09-15"
    );
    assert.equal(versioned.length, 1);
    assert.equal(versioned[0]?.id, "new");
  });
});

describe("payroll tax report periods", () => {
  it("bounds a year, quarter, and leap month", () => {
    assert.deepEqual(taxPeriodBounds({ year: "2026" }), { from: "2026-01-01", to: "2026-12-31" });
    assert.deepEqual(taxPeriodBounds({ year: "2026", quarter: "3" }), { from: "2026-07-01", to: "2026-09-30" });
    assert.deepEqual(taxPeriodBounds({ year: "2024", month: "2" }), { from: "2024-02-01", to: "2024-02-29" });
    assert.match(taxPeriodBounds({ year: "2026", month: "2", quarter: "1" }).error ?? "", /month or a quarter/);
  });
});

describe("payroll tax summary", () => {
  it("reports employee withholding, employer tax, and the combined liability", () => {
    const summary = summarizePayrollTaxes([
      { side: "EMPLOYEE", code: "FEDERAL", label: "Federal", amount: 100 },
      { side: "EMPLOYEE", code: "SOCIAL_SECURITY", label: "Social Security", amount: 62 },
      { side: "EMPLOYER", code: "SOCIAL_SECURITY", label: "Employer Social Security", amount: 62 },
      { side: "EMPLOYER", code: "FUTA", label: "FUTA", amount: 6 },
    ]);
    assert.equal(summary.employeeWithholding, 162);
    assert.equal(summary.employerTaxes, 68);
    assert.equal(summary.totalPayrollTax, 230);
  });
});

describe("pay stub tenancy and sensitivity", () => {
  it("always scopes stub queries to the business", () => {
    const where = payStubWhere({ businessId: "biz-a", employeeId: "emp-other" });
    assert.equal(where.businessId, "biz-a");
    assert.equal(where.employeeId, "emp-other");
    assert.equal(where.payrollRun && "businessId" in where.payrollRun ? where.payrollRun.businessId : "", "biz-a");
  });

  it("refuses a second processed run for the same period", () => {
    assert.match(processBlockReason("PROCESSED") ?? "", /already has processed/);
    assert.equal(processBlockReason("VOID"), null);
    assert.equal(processBlockReason(null), null);
  });

  it("masks a Social Security number and leaves an EIN visible", () => {
    assert.equal(maskSensitiveId("123-45-6789"), "***-**-6789");
    assert.equal(maskSensitiveId("123456789"), "***-**-6789");
    assert.equal(maskSensitiveId("12-3456789"), "12-3456789");
  });
});
