import { BrandWordmark } from "@/components/brand/brand-wordmark";

export default function DashboardLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading EmeraldOne">
      <BrandWordmark />
      <div className="h-8 w-48 animate-pulse rounded-lg bg-slate-200" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white" />
    </div>
  );
}
