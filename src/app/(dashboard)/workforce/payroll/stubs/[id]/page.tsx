import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAuth, hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { getPayStub } from "@/lib/workforce/pay-stub-service";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { PrintStubButton } from "@/components/workforce/pay-stub-actions";

export const metadata = { title: "Pay stub" };

const SECTIONS = [
  { title: "Earnings", kinds: ["EARNING"] },
  { title: "Deductions", kinds: ["DEDUCTION"] },
  { title: "Employee taxes", kinds: ["TAX"] },
  { title: "Employer payroll taxes", kinds: ["EMPLOYER_TAX"] },
];

export default async function PayStubPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth();
  if (!hasPermission(ctx, PERMISSIONS.VIEW_PAYROLL)) redirect("/workforce");
  const { id } = await params;
  const stub = await getPayStub(ctx.business.id, id);
  if (!stub) notFound();

  const totals = [
    ["Gross", stub.gross, stub.ytdGross],
    ["Pre-tax deductions", stub.preTaxDeductions, null],
    ["Taxable wages", stub.taxableWages, null],
    ["Employee taxes", stub.employeeTaxes, stub.ytdEmployeeTaxes],
    ["Post-tax deductions", stub.postTaxDeductions, null],
    ["Net pay", stub.net, stub.ytdNet],
    ["Employer payroll taxes", stub.employerTaxes, stub.ytdEmployerTaxes],
    ["Deductions YTD", null, stub.ytdDeductions],
  ] as const;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div className="flex items-center gap-4">
          <Link href="/workforce/payroll/stubs">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Pay stub</h1>
            <p className="text-sm text-slate-500">{stub.employeeName} · {stub.payDate}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <PrintStubButton />
          <Button asChild>
            <a href={`/api/workforce/payroll/stubs/${stub.id}/pdf`}>Download PDF</a>
          </Button>
        </div>
      </div>

      {stub.runStatus === "VOID" ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 print:hidden">
          This run was voided. The amounts below are the original snapshot and are excluded from YTD and tax reports.
        </p>
      ) : null}

      <Card className="print:border-0 print:shadow-none">
        <CardContent className="space-y-6 pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
            <div>
              <p className="text-lg font-semibold text-slate-950">{stub.employerName}</p>
              {stub.employerAddress ? <p className="text-sm text-slate-600">{stub.employerAddress}</p> : null}
              {stub.employerReference ? <p className="text-sm text-slate-600">Employer reference {stub.employerReference}</p> : null}
            </div>
            <div className="text-sm text-slate-700 sm:text-right">
              <p className="font-semibold text-slate-900">{stub.employeeName}</p>
              {stub.employeeNumber ? <p>Employee ID {stub.employeeNumber}</p> : null}
              {stub.employeeAddress ? <p>{stub.employeeAddress}</p> : null}
              <p>{stub.payType}</p>
              <p>{stub.periodStart} to {stub.periodEnd}</p>
              <p>Pay date {stub.payDate}</p>
            </div>
          </div>

          {SECTIONS.map((section) => {
            const lines = stub.lines.filter((line) => section.kinds.includes(line.kind));
            if (!lines.length) return null;
            return (
              <section key={section.title}>
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{section.title}</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="py-2 pr-3 font-medium">Description</th>
                        <th className="py-2 pr-3 font-medium">Hours</th>
                        <th className="py-2 pr-3 font-medium">Rate</th>
                        <th className="py-2 pr-3 text-right font-medium">Current</th>
                        <th className="py-2 text-right font-medium">YTD</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line) => (
                        <tr key={line.id} className="border-b border-slate-100">
                          <td className="py-2 pr-3">
                            <p className="font-medium text-slate-900">{line.label}</p>
                            {line.detail ? <p className="text-xs text-slate-500">{line.detail}</p> : null}
                          </td>
                          <td className="py-2 pr-3">{line.hours != null ? line.hours.toFixed(2) : "—"}</td>
                          <td className="py-2 pr-3">{line.kind === "EARNING" && line.rate != null ? formatCurrency(line.rate) : "—"}</td>
                          <td className="py-2 pr-3 text-right">{formatCurrency(line.amount)}</td>
                          <td className="py-2 text-right">{formatCurrency(line.ytdAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Totals</h2>
            <dl className="grid gap-3 sm:grid-cols-2">
              {totals.map(([label, current, ytd]) => (
                <div key={label} className="flex items-baseline justify-between gap-4 border-b border-slate-100 py-2">
                  <dt className="text-slate-600">{label}</dt>
                  <dd className="text-right font-semibold text-slate-900">
                    {current != null ? formatCurrency(current) : ""}
                    {ytd != null ? <span className="ml-3 text-sm font-normal text-slate-500">YTD {formatCurrency(ytd)}</span> : null}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
