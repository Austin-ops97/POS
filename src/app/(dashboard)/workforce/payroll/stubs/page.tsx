import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { requireAuth, hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { listPayStubs, listPayrollRuns } from "@/lib/workforce/pay-stub-service";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { formatCurrency } from "@/lib/utils";
import { VoidPayrollButton } from "@/components/workforce/pay-stub-actions";

export const metadata = { title: "Pay stubs" };

export default async function PayStubsPage({
  searchParams,
}: {
  searchParams: Promise<{ runId?: string; employeeId?: string; from?: string; to?: string }>;
}) {
  const ctx = await requireAuth();
  if (!hasPermission(ctx, PERMISSIONS.VIEW_PAYROLL)) redirect("/workforce");
  const params = await searchParams;
  const [stubs, runs, employees] = await Promise.all([
    listPayStubs({
      businessId: ctx.business.id,
      payrollRunId: params.runId,
      employeeId: params.employeeId,
      from: params.from,
      to: params.to,
    }),
    listPayrollRuns(ctx.business.id),
    db.employeeProfile.findMany({
      where: { businessId: ctx.business.id, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const selectedRun = runs.find((run) => run.id === params.runId);
  const canManage = hasPermission(ctx, PERMISSIONS.MANAGE_PAYROLL);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/workforce/payroll">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pay stubs</h1>
          <p className="text-sm text-slate-500">Processed snapshots. Voided runs stay stored and are omitted here.</p>
        </div>
      </div>

      <form className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5" method="get">
        <label className="space-y-1 text-sm">
          <span className="text-slate-600">Payroll run</span>
          <select name="runId" defaultValue={params.runId ?? ""} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3">
            <option value="">All processed</option>
            {runs.filter((run) => run.status === "PROCESSED").map((run) => (
              <option key={run.id} value={run.id}>
                {run.payDate} · {run.periodStart} to {run.periodEnd}
              </option>
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
          <span className="text-slate-600">Pay date from</span>
          <input type="date" name="from" defaultValue={params.from ?? ""} className="h-10 w-full rounded-md border border-slate-200 px-3" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-600">Pay date to</span>
          <input type="date" name="to" defaultValue={params.to ?? ""} className="h-10 w-full rounded-md border border-slate-200 px-3" />
        </label>
        <div className="flex items-end">
          <Button type="submit" variant="outline" className="w-full">Apply filters</Button>
        </div>
      </form>

      {selectedRun && canManage && selectedRun.status === "PROCESSED" ? (
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600">
            {selectedRun.stubCount} stub{selectedRun.stubCount === 1 ? "" : "s"} · pay date {selectedRun.payDate}
          </p>
          <VoidPayrollButton runId={selectedRun.id} />
        </div>
      ) : null}

      {runs.some((run) => run.status === "VOID") ? (
        <p className="text-sm text-slate-500">
          Voided runs: {runs.filter((run) => run.status === "VOID").map((run) => run.payDate).join(", ")}. Their amounts were not rewritten.
        </p>
      ) : null}

      {stubs.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No pay stubs"
          description="Process a pay period from Payroll to create stubs. Tax rules are optional and start at zero until you add them."
          actionLabel="Back to payroll"
          actionHref="/workforce/payroll"
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-slate-100">
              {stubs.map((stub) => (
                <li key={stub.id}>
                  <Link href={`/workforce/payroll/stubs/${stub.id}`} className="flex flex-col gap-2 px-4 py-4 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{stub.employeeName}</p>
                      <p className="text-sm text-slate-500">
                        {stub.payType} · {stub.periodStart} to {stub.periodEnd} · Pay {stub.payDate}
                      </p>
                    </div>
                    <div className="text-sm text-slate-700 sm:text-right">
                      <p className="font-semibold text-slate-900">{formatCurrency(stub.net)} net</p>
                      <p>Gross {formatCurrency(stub.gross)} · Withholding {formatCurrency(stub.employeeTaxes)} · Employer tax {formatCurrency(stub.employerTaxes)}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
