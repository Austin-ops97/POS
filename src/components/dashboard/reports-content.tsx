"use client";

import Link from "next/link";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Crown } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { BILLING_URL } from "@/lib/subscription-access";

const CHART_COLORS = ["#0f172a", "#334155", "#64748b", "#94a3b8", "#cbd5e1"];

type ReportsContentProps = {
  salesByDay: Array<{ date: string; sales: number; orders: number }>;
  topProducts: Array<{ name: string; revenue: number; quantity: number }>;
  employeeSales: Array<{ name: string; sales: number; orders: number }>;
  paymentMethods: Array<{ method: string; amount: number }>;
  advancedReports?: boolean;
};

function AdvancedReportsUpgrade() {
  return (
    <Card className="border-slate-200">
      <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
        <Crown className="h-10 w-10 text-slate-400" />
        <div>
          <p className="font-medium text-slate-900">Advanced reports</p>
          <p className="mt-1 max-w-md text-sm text-slate-500">
            Product, employee, and payment breakdowns are available on Pro,
            Multi-Location, and Enterprise plans.
          </p>
        </div>
        <Link href={BILLING_URL}>
          <Button>Upgrade plan</Button>
        </Link>
      </CardContent>
    </Card>
  );
}

export function ReportsContent({
  salesByDay,
  topProducts,
  employeeSales,
  paymentMethods,
  advancedReports = true,
}: ReportsContentProps) {
  return (
    <Tabs defaultValue="sales" className="space-y-6">
      <TabsList>
        <TabsTrigger value="sales">Sales Summary</TabsTrigger>
        <TabsTrigger value="products" disabled={!advancedReports}>
          Products
        </TabsTrigger>
        <TabsTrigger value="employees" disabled={!advancedReports}>
          Employees
        </TabsTrigger>
        <TabsTrigger value="payments" disabled={!advancedReports}>
          Payment Methods
        </TabsTrigger>
      </TabsList>

      <TabsContent value="sales" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Sales Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={salesByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                <Line type="monotone" dataKey="sales" stroke="#0f172a" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Orders by Day</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={salesByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <Tooltip />
                <Bar dataKey="orders" fill="#0f172a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="products">
        {advancedReports ? (
          <Card>
            <CardHeader>
              <CardTitle>Top Products by Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={360}>
                <BarChart data={topProducts} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tickFormatter={(v) => `$${v}`} stroke="#94a3b8" />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} stroke="#94a3b8" />
                  <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                  <Bar dataKey="revenue" fill="#0f172a" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        ) : (
          <AdvancedReportsUpgrade />
        )}
      </TabsContent>

      <TabsContent value="employees">
        {advancedReports ? (
          <Card>
            <CardHeader>
              <CardTitle>Employee Sales</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={360}>
                <BarChart data={employeeSales}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                  <Bar dataKey="sales" fill="#0f172a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        ) : (
          <AdvancedReportsUpgrade />
        )}
      </TabsContent>

      <TabsContent value="payments">
        {advancedReports ? (
          <Card>
            <CardHeader>
              <CardTitle>Payment Methods</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={360}>
                <PieChart>
                  <Pie
                    data={paymentMethods}
                    dataKey="amount"
                    nameKey="method"
                    cx="50%"
                    cy="50%"
                    outerRadius={120}
                    label={({ method, percent }) =>
                      `${method} ${((percent ?? 0) * 100).toFixed(0)}%`
                    }
                  >
                    {paymentMethods.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        ) : (
          <AdvancedReportsUpgrade />
        )}
      </TabsContent>
    </Tabs>
  );
}
