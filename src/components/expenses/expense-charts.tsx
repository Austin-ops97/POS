"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/utils";

const COLORS = ["#0f172a", "#334155", "#64748b", "#94a3b8", "#cbd5e1", "#1e3a5f", "#3b82f6"];

type NamedTotal = { name: string; total: number; count?: number };

export function MonthlySpendChart({ data }: { data: Array<{ label: string; total: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#94a3b8" />
        <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" tickFormatter={(v) => `$${v}`} />
        <Tooltip formatter={(value) => formatCurrency(Number(value))} />
        <Line
          type="monotone"
          dataKey="total"
          stroke="#0f172a"
          strokeWidth={2.5}
          dot={{ r: 3, fill: "#0f172a" }}
          activeDot={{ r: 5 }}
          animationDuration={600}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function SpendBarChart({ data }: { data: NamedTotal[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data.slice(0, 8)} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#94a3b8" interval={0} angle={-20} textAnchor="end" height={60} />
        <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" tickFormatter={(v) => `$${v}`} />
        <Tooltip formatter={(value) => formatCurrency(Number(value))} />
        <Bar dataKey="total" radius={[8, 8, 0, 0]} animationDuration={500}>
          {data.slice(0, 8).map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SpendPieChart({ data }: { data: NamedTotal[] }) {
  const chartData = data.slice(0, 6);
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={chartData}
          dataKey="total"
          nameKey="name"
          innerRadius={55}
          outerRadius={95}
          paddingAngle={3}
          animationDuration={500}
        >
          {chartData.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value) => formatCurrency(Number(value))} />
      </PieChart>
    </ResponsiveContainer>
  );
}
