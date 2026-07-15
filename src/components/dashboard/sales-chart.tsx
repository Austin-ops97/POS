"use client";

import dynamic from "next/dynamic";

const SalesChartInner = dynamic(
  () => import("./sales-chart-inner").then((m) => m.SalesChartInner),
  {
    ssr: false,
    loading: () => (
      <div className="h-[300px] w-full animate-pulse rounded-xl bg-slate-100" />
    ),
  }
);

type SalesChartProps = {
  data: Array<{ date: string; sales: number }>;
};

export function SalesChart({ data }: SalesChartProps) {
  return <SalesChartInner data={data} />;
}
