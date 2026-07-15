"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";

type ReportRow = { key: string; label: string; total: number; count: number };

export function ExpenseReportsClient({ canExport }: { canExport: boolean }) {
  const [pending, startTransition] = useTransition();
  const [groupBy, setGroupBy] = useState("category");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [grandTotal, setGrandTotal] = useState(0);

  function buildQuery(format: string) {
    const params = new URLSearchParams({ groupBy, format });
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    return params.toString();
  }

  function loadReport() {
    startTransition(async () => {
      const res = await fetch(`/api/expenses/report?${buildQuery("json")}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Report failed");
        return;
      }
      setRows(data.rows ?? []);
      setGrandTotal(data.grandTotal ?? 0);
    });
  }

  function download(format: "csv" | "excel" | "pdf") {
    window.open(`/api/expenses/report?${buildQuery(format)}`, "_blank");
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Finance</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
          Expense Reports
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Slice spend by employee, location, vendor, card, project, and more.
        </p>
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-4">
          <div>
            <Label>Group by</Label>
            <Select value={groupBy} onValueChange={setGroupBy}>
              <SelectTrigger className="mt-1.5 h-11 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[
                  "employee",
                  "location",
                  "department",
                  "vendor",
                  "category",
                  "card",
                  "date",
                  "project",
                  "job",
                  "status",
                  "approval",
                ].map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>From</Label>
            <Input
              type="date"
              className="mt-1.5 h-11 rounded-xl"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div>
            <Label>To</Label>
            <Input
              type="date"
              className="mt-1.5 h-11 rounded-xl"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
          <div className="flex items-end gap-2">
            <Button className="h-11 rounded-xl" disabled={pending} onClick={loadReport}>
              Run report
            </Button>
          </div>
          {canExport ? (
            <div className="flex flex-wrap gap-2 sm:col-span-4">
              <Button variant="outline" className="rounded-xl" onClick={() => download("csv")}>
                Export CSV
              </Button>
              <Button variant="outline" className="rounded-xl" onClick={() => download("excel")}>
                Export Excel
              </Button>
              <Button variant="outline" className="rounded-xl" onClick={() => download("pdf")}>
                Export PDF
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Results</CardTitle>
          <p className="text-sm font-semibold">{formatCurrency(grandTotal)}</p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="py-2 pr-4">Group</th>
                  <th className="py-2 pr-4">Count</th>
                  <th className="py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-8 text-slate-500">
                      Run a report to see grouped spend.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.key} className="border-t border-slate-100">
                      <td className="py-2.5 pr-4 font-medium">{row.label}</td>
                      <td className="py-2.5 pr-4">{row.count}</td>
                      <td className="py-2.5">{formatCurrency(row.total)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
