import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAuth, hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import { getPayrollTaxSummary, listDeductionConfigs, listPayrollRuns, listTaxConfigs } from "@/lib/workforce/pay-stub-service";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { PayrollTaxForm } from "@/components/workforce/payroll-tax-form";

export const metadata = { title: "Payroll taxes" };

export default async function PayrollTaxesPage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string;
    quarter?: string;
    month?: string;
    from?: string;
    to?: string;
    runId?: string;
    employeeId?: string;
    taxType?: string;
  }>;
}) {
  const ctx = await requireAuth();
  if (!hasPermission(ctx, PERMISSIONS.VIEW_PAYROLL)) redirect("/workforce");
  const params = await searchParams;
  const filters = {
    year: params.year,
    quarter: params.quarter,
    month: params.month,
    from: params.from,
    to: params.to,
    payrollRunId: params.runId,
    employeeId: params.employeeId,
    taxType: params.taxType,
  };
  let summary = {
    employeeWithholding: 0,
    employerTaxes: 0,
    totalPayrollTax: 0,
    byType: [] as Array<{ side: "EMPLOYEE" | "EMPLOYER"; code: string; label: string; amount: number }>,
  };
  let reportError: string | null = null;
  try {
    summary = await getPayrollTaxSummary({ businessId: ctx.business.id, ...filters });
  } catch (error) {
    reportError = error instanceof Error ? error.message : "Could not load the payroll tax report";
  }
  const [taxes, deductions, runs, employees] = await Promise.all([
    listTaxConfigs(ctx.business.id),
    listDeductionConfigs(ctx.business.id),
    listPayrollRuns(ctx.business.id),
    db.employeeProfile.findMany({
      where: { businessId: ctx.business.id, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const taxCodes = [...new Set(taxes.map((tax) => tax.code))];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/workforce/payroll">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Payroll taxes</h1>
          <p className="text-sm text-slate-500">Employee withholding is separate from employer payroll tax liability.</p>
        </div>
      </div>

      <form className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-3 lg:grid-cols-4" method="get">
        <label className="space-y-1 text-sm">
          <span className="text-slate-600">Year</span>
          <input name="year" defaultValue={params.year ?? ""} placeholder="2026" className="h-10 w-full rounded-md border border-slate-200 px-3" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-600">Quarter</span>
          <select name="quarter" defaultValue={params.quarter ?? ""} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3">
            <option value="">Any</option>
            <option value="1">Q1</option>
            <option value="2">Q2</option>
            <option value="3">Q3</option>
            <option value="4">Q4</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-600">Month</span>
          <input name="month" defaultValue={params.month ?? ""} placeholder="1-12" className="h-10 w-full rounded-md border border-slate-200 px-3" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-600">Payroll run</span>
          <select name="runId" defaultValue={params.runId ?? ""} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3">
            <option value="">All runs</option>
            {runs.filter((run) => run.status === "PROCESSED").map((run) => (
              <option key={run.id} value={run.id}>{run.payDate}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-600">Employee</span>
          <select name="employeeId" defaultValue={params.employeeId ?? ""} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3">
            <option value="">Everyone</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>{employee.name}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-600">Tax type</span>
          <select name="taxType" defaultValue={params.taxType ?? ""} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3">
            <option value="">All types</option>
            {taxCodes.map((code) => (
              <option key={code} value={code}>{code}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-600">From</span>
          <input type="date" name="from" defaultValue={params.from ?? ""} className="h-10 w-full rounded-md border border-slate-200 px-3" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-600">To</span>
          <input type="date" name="to" defaultValue={params.to ?? ""} className="h-10 w-full rounded-md border border-slate-200 px-3" />
        </label>
        <div className="flex items-end md:col-span-3 lg:col-span-4">
          <Button type="submit">Update report</Button>
        </div>
      </form>

      {reportError ? <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{reportError}</p> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Employee withholding</p>
            <p className="text-2xl font-bold">{formatCurrency(summary.employeeWithholding)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Employer payroll taxes</p>
            <p className="text-2xl font-bold">{formatCurrency(summary.employerTaxes)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Total payroll tax liability</p>
            <p className="text-2xl font-bold">{formatCurrency(summary.totalPayrollTax)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {summary.byType.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">No processed payroll tax for this filter. Process a payroll run after tax rules are in effect.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
                    <th className="px-4 py-3 font-medium">Side</th>
                    <th className="px-4 py-3 font-medium">Tax type</th>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byType.map((row) => (
                    <tr key={`${row.side}-${row.code}`} className="border-b border-slate-100">
                      <td className="px-4 py-3">{row.side === "EMPLOYER" ? "Employer" : "Employee"}</td>
                      <td className="px-4 py-3">{row.code}</td>
                      <td className="px-4 py-3">{row.label}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <PayrollTaxForm
        canManage={hasPermission(ctx, PERMISSIONS.MANAGE_PAYROLL)}
        taxes={taxes}
        deductions={deductions}
      />
    </div>
  );
}
