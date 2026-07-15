"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Camera,
  ClipboardCheck,
  Download,
  Plus,
  Receipt,
  Upload,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/dashboard/stat-card";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ExpenseStatusBadge } from "./status-badge";
import { MonthlySpendChart, SpendBarChart, SpendPieChart } from "./expense-charts";
import { Progress } from "@/components/ui/progress";

type DashboardData = {
  cards: {
    pendingApproval: number;
    approved: number;
    reimbursed: number;
    flagged: number;
    missingReceipts: number;
    thisMonthSpend: number;
    companyCardBalance: number;
    reimbursementsOwed: number;
  };
  charts: {
    monthlySpend: Array<{ label: string; total: number }>;
    byCategory: Array<{ name: string; total: number; count: number }>;
    byEmployee: Array<{ name: string; total: number; count: number }>;
    byLocation: Array<{ name: string; total: number; count: number }>;
    byDepartment: Array<{ name: string; total: number; count: number }>;
    largestVendors: Array<{
      id: string;
      name: string;
      total: number;
      average: number;
      count: number;
    }>;
  };
  recentActivity: Array<{
    id: string;
    merchant: string;
    total: unknown;
    status: string;
    purchaseDate: string | Date;
    missingReceipt: boolean;
    employee: { name: string };
    category: { name: string } | null;
    flags: Array<{ id: string }>;
  }>;
  cardUtilization: Array<{
    id: string;
    name: string;
    lastFour: string;
    spent: number;
    limit: number | null;
  }>;
  budgets: Array<{
    id: string;
    category: string;
    amount: number;
    period: string;
  }>;
};

export function ExpenseDashboard({ data }: { data: DashboardData }) {
  const { cards, charts, recentActivity, cardUtilization } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
            Finance
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
            Expenses
          </h1>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            Company cards, receipts, approvals, and reimbursements in one place.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild className="min-h-11 rounded-xl">
            <Link href="/finance/expenses/new">
              <Plus className="h-4 w-4" />
              New Expense
            </Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11 rounded-xl">
            <Link href="/finance/expenses/new?scan=1">
              <Camera className="h-4 w-4" />
              Scan Receipt
            </Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11 rounded-xl">
            <Link href="/finance/expenses/new?upload=1">
              <Upload className="h-4 w-4" />
              Upload Receipt
            </Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11 rounded-xl">
            <Link href="/finance/expenses/approvals">
              <ClipboardCheck className="h-4 w-4" />
              Review Pending
            </Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11 rounded-xl">
            <Link href="/finance/reports">
              <Download className="h-4 w-4" />
              Download Report
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Pending Approval" value={String(cards.pendingApproval)} icon={ClipboardCheck} />
        <StatCard title="Approved" value={String(cards.approved)} icon={Wallet} />
        <StatCard title="Reimbursed" value={String(cards.reimbursed)} icon={Receipt} />
        <StatCard title="Flagged" value={String(cards.flagged)} icon={AlertTriangle} />
        <StatCard title="Missing Receipts" value={String(cards.missingReceipts)} />
        <StatCard title="This Month Spend" value={formatCurrency(cards.thisMonthSpend)} />
        <StatCard title="Company Card Balance" value={formatCurrency(cards.companyCardBalance)} />
        <StatCard title="Reimbursements Owed" value={formatCurrency(cards.reimbursementsOwed)} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Monthly Spend</CardTitle>
          </CardHeader>
          <CardContent>
            <MonthlySpendChart data={charts.monthlySpend} />
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Spend by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <SpendPieChart data={charts.byCategory} />
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Spend by Employee</CardTitle>
          </CardHeader>
          <CardContent>
            <SpendBarChart data={charts.byEmployee} />
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Spend by Location</CardTitle>
          </CardHeader>
          <CardContent>
            <SpendBarChart data={charts.byLocation} />
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Spend by Department</CardTitle>
          </CardHeader>
          <CardContent>
            <SpendBarChart data={charts.byDepartment} />
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Largest Vendors</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {charts.largestVendors.length === 0 ? (
                <p className="text-sm text-slate-500">Vendors will appear as expenses are created.</p>
              ) : (
                charts.largestVendors.map((vendor) => (
                  <li
                    key={vendor.id}
                    className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2.5"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{vendor.name}</p>
                      <p className="text-xs text-slate-500">
                        {vendor.count} purchases · avg {formatCurrency(vendor.average)}
                      </p>
                    </div>
                    <p className="font-semibold">{formatCurrency(vendor.total)}</p>
                  </li>
                ))
              )}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Activity</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/finance/expenses?view=list">View all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {recentActivity.length === 0 ? (
                <p className="text-sm text-slate-500">No expenses yet. Capture your first receipt.</p>
              ) : (
                recentActivity.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/finance/expenses/${item.id}`}
                      className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-3 transition hover:bg-slate-50"
                    >
                      <div>
                        <p className="font-medium text-slate-900">{item.merchant}</p>
                        <p className="text-xs text-slate-500">
                          {item.employee.name}
                          {item.category ? ` · ${item.category.name}` : ""}
                          {" · "}
                          {formatDate(item.purchaseDate)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{formatCurrency(Number(item.total))}</p>
                        <div className="mt-1 flex justify-end gap-1">
                          <ExpenseStatusBadge status={item.status} />
                          {item.missingReceipt ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                              Missing receipt
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))
              )}
            </ul>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Card utilization</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {cardUtilization.length === 0 ? (
              <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                No company cards yet.{" "}
                <Link href="/finance/cards" className="font-medium text-slate-900 underline">
                  Add a card
                </Link>
              </div>
            ) : (
              cardUtilization.map((card) => {
                const pct =
                  card.limit && card.limit > 0
                    ? Math.min(100, Math.round((card.spent / card.limit) * 100))
                    : 0;
                return (
                  <div key={card.id} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">
                        {card.name} ····{card.lastFour}
                      </span>
                      <span className="text-slate-500">
                        {formatCurrency(card.spent)}
                        {card.limit != null ? ` / ${formatCurrency(card.limit)}` : ""}
                      </span>
                    </div>
                    <Progress value={pct} />
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
