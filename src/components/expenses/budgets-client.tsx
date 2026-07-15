"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
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
import { Progress } from "@/components/ui/progress";
import { formatCurrency } from "@/lib/utils";

type BudgetRow = {
  id: string;
  category: { name: string } | string;
  period: string;
  amount: number | unknown;
  spent?: number;
  percent?: number;
  alertLevel?: number;
  year: number;
  month: number | null;
  quarter: number | null;
};

export function BudgetsClient({
  budgets,
  categories,
  canManage,
}: {
  budgets: BudgetRow[];
  categories: Array<{ id: string; name: string }>;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const now = new Date();
  const [form, setForm] = useState({
    categoryId: "",
    period: "MONTHLY",
    amount: "",
    year: String(now.getUTCFullYear()),
    month: String(now.getUTCMonth() + 1),
    quarter: String(Math.ceil((now.getUTCMonth() + 1) / 3)),
  });

  function createBudget() {
    startTransition(async () => {
      const res = await fetch("/api/expenses/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: form.categoryId,
          period: form.period,
          amount: Number(form.amount),
          year: Number(form.year),
          month: form.period === "MONTHLY" ? Number(form.month) : null,
          quarter: form.period === "QUARTERLY" ? Number(form.quarter) : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Could not save budget");
        return;
      }
      toast.success("Budget saved");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Finance</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Budgets</h1>
        <p className="mt-1 text-sm text-slate-500">
          Monthly, quarterly, and annual category budgets with 75 / 90 / 100% alerts.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {budgets.map((budget) => {
          const name =
            typeof budget.category === "string" ? budget.category : budget.category.name;
          const pct = budget.percent ?? 0;
          return (
            <Card key={budget.id} className="rounded-2xl">
              <CardHeader>
                <CardTitle className="text-base">{name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">
                    {budget.period} {budget.year}
                    {budget.month ? ` · M${budget.month}` : ""}
                    {budget.quarter ? ` · Q${budget.quarter}` : ""}
                  </span>
                  <span className="font-medium">
                    {formatCurrency(budget.spent ?? 0)} / {formatCurrency(Number(budget.amount))}
                  </span>
                </div>
                <Progress value={Math.min(100, pct)} />
                <p
                  className={
                    pct >= 100
                      ? "text-xs font-medium text-red-600"
                      : pct >= 90
                        ? "text-xs font-medium text-amber-700"
                        : pct >= 75
                          ? "text-xs font-medium text-amber-600"
                          : "text-xs text-slate-500"
                  }
                >
                  {pct.toFixed(1)}% used
                  {pct >= 75 ? " · alert threshold reached" : ""}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {canManage ? (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Set budget</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Category</Label>
              <Select
                value={form.categoryId || undefined}
                onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}
              >
                <SelectTrigger className="mt-1.5 h-11 rounded-xl">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Period</Label>
              <Select
                value={form.period}
                onValueChange={(v) => setForm((f) => ({ ...f, period: v }))}
              >
                <SelectTrigger className="mt-1.5 h-11 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MONTHLY">Monthly</SelectItem>
                  <SelectItem value="QUARTERLY">Quarterly</SelectItem>
                  <SelectItem value="ANNUAL">Annual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount</Label>
              <Input
                type="number"
                className="mt-1.5 h-11 rounded-xl"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div>
              <Label>Year</Label>
              <Input
                type="number"
                className="mt-1.5 h-11 rounded-xl"
                value={form.year}
                onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
              />
            </div>
            {form.period === "MONTHLY" ? (
              <div>
                <Label>Month</Label>
                <Input
                  type="number"
                  min={1}
                  max={12}
                  className="mt-1.5 h-11 rounded-xl"
                  value={form.month}
                  onChange={(e) => setForm((f) => ({ ...f, month: e.target.value }))}
                />
              </div>
            ) : null}
            {form.period === "QUARTERLY" ? (
              <div>
                <Label>Quarter</Label>
                <Input
                  type="number"
                  min={1}
                  max={4}
                  className="mt-1.5 h-11 rounded-xl"
                  value={form.quarter}
                  onChange={(e) => setForm((f) => ({ ...f, quarter: e.target.value }))}
                />
              </div>
            ) : null}
            <div className="sm:col-span-3">
              <Button className="min-h-11 rounded-xl" disabled={pending} onClick={createBudget}>
                Save budget
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
