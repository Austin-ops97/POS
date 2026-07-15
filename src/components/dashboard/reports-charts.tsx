"use client";

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
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

type ReportsChartsProps = {
  salesByDay: Array<{ date: string; sales: number; orders: number }>;
};

export function ReportsCharts({ salesByDay }: ReportsChartsProps) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Sales Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[240px] w-full min-w-0 sm:h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={salesByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis
                  tick={{ fontSize: 12 }}
                  stroke="#94a3b8"
                  tickFormatter={(v) => `$${v}`}
                  width={48}
                />
                <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                <Line type="monotone" dataKey="sales" stroke="#0f172a" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Orders by Day</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] w-full min-w-0 sm:h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salesByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" width={36} />
                <Tooltip />
                <Bar dataKey="orders" fill="#0f172a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
