"use client";

import { useState, useEffect } from "react";
import { Download, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import type { PayPeriod } from "@/lib/workforce/pay-period";

type PayrollRow = {
  employeeId: string;
  employeeName: string;
  hourlyWage: number;
  scheduledHours: number;
  actualHours: number;
  breakHours: number;
  regularHours: number;
  overtimeHours: number;
  regularPay: number;
  overtimePay: number;
  bonusTotal: number;
  totalPay: number;
  flags: string[];
};

type PayrollContentProps = {
  periods: PayPeriod[];
  defaultPeriod: PayPeriod;
};

export function PayrollContent({ periods, defaultPeriod }: PayrollContentProps) {
  const [periodStart, setPeriodStart] = useState(
    defaultPeriod.start.toISOString().split("T")[0]
  );
  const [periodEnd, setPeriodEnd] = useState(
    defaultPeriod.end.toISOString().split("T")[0]
  );
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [totals, setTotals] = useState({ scheduledHours: 0, actualHours: 0, totalPay: 0 });
  const [loading, setLoading] = useState(true);
  const [bonusModal, setBonusModal] = useState<PayrollRow | null>(null);
  const [bonusForm, setBonusForm] = useState({ amount: "", description: "" });

  async function loadPayroll() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/workforce/payroll?periodStart=${periodStart}&periodEnd=${periodEnd}`
      );
      if (res.ok) {
        const data = await res.json();
        setRows(data.rows);
        setTotals(data.totals);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPayroll();
  }, [periodStart, periodEnd]);

  function selectPeriod(value: string) {
    const period = periods.find((p) => p.label === value);
    if (period) {
      setPeriodStart(period.start.toISOString().split("T")[0]);
      setPeriodEnd(period.end.toISOString().split("T")[0]);
    }
  }

  function exportCsv() {
    window.open(
      `/api/workforce/payroll?periodStart=${periodStart}&periodEnd=${periodEnd}&format=csv`,
      "_blank"
    );
  }

  async function addBonus() {
    if (!bonusModal) return;
    const res = await fetch("/api/workforce/payroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: bonusModal.employeeId,
        amount: parseFloat(bonusForm.amount),
        description: bonusForm.description,
        payPeriodStart: periodStart,
        payPeriodEnd: periodEnd,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      toast.error(err?.error ?? "Failed to add bonus");
      return;
    }
    toast.success("Bonus added");
    setBonusModal(null);
    setBonusForm({ amount: "", description: "" });
    loadPayroll();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="space-y-2">
            <Label>Pay period</Label>
            <Select
              defaultValue={defaultPeriod.label}
              onValueChange={selectPeriod}
            >
              <SelectTrigger className="w-[240px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {periods.map((p) => (
                  <SelectItem key={p.label} value={p.label}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Start</Label>
            <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>End</Label>
            <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
        </div>
        <Button variant="outline" onClick={exportCsv}>
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Scheduled Hours</p>
            <p className="text-2xl font-bold">{totals.scheduledHours.toFixed(1)}h</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Actual Hours</p>
            <p className="text-2xl font-bold">{totals.actualHours.toFixed(1)}h</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Total Payroll</p>
            <p className="text-2xl font-bold">{formatCurrency(totals.totalPay)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          {loading ? (
            <p className="p-8 text-center text-sm text-slate-500">Loading payroll...</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
                  <th className="px-4 py-3 font-medium">Employee</th>
                  <th className="px-4 py-3 font-medium">Sched</th>
                  <th className="px-4 py-3 font-medium">Actual</th>
                  <th className="px-4 py-3 font-medium">Breaks</th>
                  <th className="px-4 py-3 font-medium">Regular</th>
                  <th className="px-4 py-3 font-medium">OT</th>
                  <th className="px-4 py-3 font-medium">Bonuses</th>
                  <th className="px-4 py-3 font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Flags</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.employeeId} className="border-b border-slate-100">
                    <td className="px-4 py-3 font-medium">{row.employeeName}</td>
                    <td className="px-4 py-3">{row.scheduledHours.toFixed(1)}</td>
                    <td className="px-4 py-3">{row.actualHours.toFixed(1)}</td>
                    <td className="px-4 py-3">{row.breakHours.toFixed(1)}</td>
                    <td className="px-4 py-3">{formatCurrency(row.regularPay)}</td>
                    <td className="px-4 py-3">{formatCurrency(row.overtimePay)}</td>
                    <td className="px-4 py-3">{formatCurrency(row.bonusTotal)}</td>
                    <td className="px-4 py-3 font-medium">{formatCurrency(row.totalPay)}</td>
                    <td className="px-4 py-3 text-xs text-amber-700">
                      {row.flags.join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setBonusModal(row)}
                      >
                        <Plus className="h-3 w-3" />
                        Bonus
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {bonusModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
          <Card className="flex max-h-[min(92dvh,100%)] w-full max-w-md flex-col overflow-hidden rounded-b-none rounded-t-2xl pb-[env(safe-area-inset-bottom)] sm:max-h-[min(90dvh,900px)] sm:rounded-xl sm:pb-0">
            <CardContent className="space-y-4 overflow-y-auto pt-6">
              <h3 className="text-lg font-semibold">
                Add Bonus — {bonusModal.employeeName}
              </h3>
              <div className="space-y-2">
                <Label>Amount ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={bonusForm.amount}
                  onChange={(e) => setBonusForm((f) => ({ ...f, amount: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={bonusForm.description}
                  onChange={(e) => setBonusForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Performance bonus, holiday pay..."
                />
              </div>
              <div className="flex gap-2 pb-2 sm:pb-0">
                <Button
                  className="flex-1"
                  disabled={!bonusForm.amount || !bonusForm.description}
                  onClick={addBonus}
                >
                  Add Bonus
                </Button>
                <Button variant="outline" onClick={() => setBonusModal(null)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
