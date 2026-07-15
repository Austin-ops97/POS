"use client";

import dynamic from "next/dynamic";
import { Download } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

const SalesCharts = dynamic(
  () => import("@/components/dashboard/reports-charts").then((m) => m.ReportsCharts),
  {
    ssr: false,
    loading: () => (
      <div className="h-[240px] animate-pulse rounded-xl bg-slate-100 sm:h-[320px]" />
    ),
  }
);

type ReportsContentProps = {
  salesByDay: Array<{ date: string; sales: number; orders: number }>;
  topProducts: Array<{ name: string; revenue: number; quantity: number }>;
  employeeSales: Array<{ name: string; sales: number; orders: number }>;
  paymentMethods: Array<{ method: string; amount: number }>;
};

export function ReportsContent({
  salesByDay,
  topProducts,
  employeeSales,
  paymentMethods,
}: ReportsContentProps) {
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            window.open("/api/reports/sales/export?format=csv", "_blank");
          }}
        >
          <Download className="mr-2 h-4 w-4" aria-hidden="true" />
          Export CSV
        </Button>
      </div>

      <Tabs defaultValue="sales" className="space-y-6">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 overflow-x-auto">
          <TabsTrigger value="sales" className="min-h-11">Sales Summary</TabsTrigger>
          <TabsTrigger value="products" className="min-h-11">Products</TabsTrigger>
          <TabsTrigger value="employees" className="min-h-11">Employees</TabsTrigger>
          <TabsTrigger value="payments" className="min-h-11">Payment Methods</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="space-y-6">
          <SalesCharts salesByDay={salesByDay} />
        </TabsContent>

        <TabsContent value="products">
          <Card>
            <CardHeader>
              <CardTitle>Top Products</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {topProducts.length === 0 ? (
                  <p className="text-sm text-slate-500">No product sales in this period.</p>
                ) : (
                  topProducts.map((product) => (
                    <div
                      key={product.name}
                      className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 last:border-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">{product.name}</p>
                        <p className="text-sm text-slate-500">{product.quantity} sold</p>
                      </div>
                      <p className="shrink-0 font-semibold text-slate-900">
                        {formatCurrency(product.revenue)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="employees">
          <Card>
            <CardHeader>
              <CardTitle>Employee Sales</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {employeeSales.length === 0 ? (
                  <p className="text-sm text-slate-500">No employee sales in this period.</p>
                ) : (
                  employeeSales.map((row) => (
                    <div
                      key={row.name}
                      className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 last:border-0"
                    >
                      <div>
                        <p className="font-medium text-slate-900">{row.name}</p>
                        <p className="text-sm text-slate-500">{row.orders} orders</p>
                      </div>
                      <p className="font-semibold text-slate-900">{formatCurrency(row.sales)}</p>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card>
            <CardHeader>
              <CardTitle>Payment Mix</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {paymentMethods.length === 0 ? (
                  <p className="text-sm text-slate-500">No payments in this period.</p>
                ) : (
                  paymentMethods.map((row) => (
                    <div
                      key={row.method}
                      className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 last:border-0"
                    >
                      <p className="font-medium text-slate-900">{row.method}</p>
                      <p className="font-semibold text-slate-900">{formatCurrency(row.amount)}</p>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
