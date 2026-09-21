"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

type Row = {
  employeeId: string;
  employeeName: string;
  regularHours: number;
  overtimeHours: number;
  doubleTimeHours: number;
  totalHours: number;
  regularPay: number | null;
  overtimePay: number | null;
  grossPay: number | null;
  exempt: boolean;
};

export function OvertimeSummary({ from, to }: { from: string; to: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/workforce/overtime?from=${from}&to=${to}`);
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Could not load overtime");
        if (!cancelled) setRows(payload.rows ?? []);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load overtime");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hours this week</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? <p className="text-sm text-slate-500">Loading hours…</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {!loading && !error && rows.length === 0 ? <p className="text-sm text-slate-500">No completed hours in this week.</p> : null}
        {!loading && !error && rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-2 pr-3 font-medium">Employee</th>
                  <th className="py-2 pr-3 font-medium">Regular hours</th>
                  <th className="py-2 pr-3 font-medium">OT hours</th>
                  <th className="py-2 pr-3 font-medium">Total hours</th>
                  <th className="py-2 pr-3 font-medium">Regular pay</th>
                  <th className="py-2 pr-3 font-medium">OT pay</th>
                  <th className="py-2 font-medium">Gross pay</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.employeeId} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-medium text-slate-900">
                      {row.employeeName}
                      {row.exempt ? <span className="ml-2 text-xs text-slate-400">OT exempt</span> : null}
                    </td>
                    <td className="py-2 pr-3">{row.regularHours.toFixed(2)}</td>
                    <td className="py-2 pr-3">
                      {row.overtimeHours.toFixed(2)}
                      {row.doubleTimeHours > 0 ? <span className="block text-xs text-slate-400">{row.doubleTimeHours.toFixed(2)} double time</span> : null}
                    </td>
                    <td className="py-2 pr-3">{row.totalHours.toFixed(2)}</td>
                    <td className="py-2 pr-3">{row.regularPay == null ? "—" : formatCurrency(row.regularPay)}</td>
                    <td className="py-2 pr-3">{row.overtimePay == null ? "—" : formatCurrency(row.overtimePay)}</td>
                    <td className="py-2">{row.grossPay == null ? "—" : formatCurrency(row.grossPay)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
