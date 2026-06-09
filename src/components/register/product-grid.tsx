"use client";

import { Package } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

export type ProductGridItem = {
  id: string;
  name: string;
  price: number;
  sku?: string | null;
  barcode?: string | null;
  categoryId?: string | null;
  imageUrl?: string | null;
  type?: string;
  taxable?: boolean;
};

type ProductGridProps = {
  products: ProductGridItem[];
  loading?: boolean;
  onSelect: (product: ProductGridItem) => void;
  className?: string;
};

export function ProductGrid({
  products,
  loading,
  onSelect,
  className,
}: ProductGridProps) {
  if (loading) {
    return (
      <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4", className)}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-xl border border-slate-200 bg-slate-100"
          />
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 py-16 text-center">
        <Package className="mb-3 h-10 w-10 text-slate-300" />
        <p className="text-sm font-medium text-slate-600">No products found</p>
        <p className="mt-1 text-xs text-slate-400">
          Try a different search or category
        </p>
      </div>
    );
  }

  return (
    <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4", className)}>
      {products.map((product) => (
        <button
          key={product.id}
          type="button"
          onClick={() => onSelect(product)}
          className="group flex min-h-[7rem] flex-col items-start justify-between rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:border-slate-300 hover:shadow-md active:scale-[0.98]"
        >
          <div className="w-full">
            <p className="line-clamp-2 text-base font-semibold text-slate-900 group-hover:text-slate-700">
              {product.name}
            </p>
            {product.sku && (
              <p className="mt-1 text-xs text-slate-400">{product.sku}</p>
            )}
          </div>
          <p className="mt-2 text-lg font-bold text-slate-900">
            {formatCurrency(product.price)}
          </p>
        </button>
      ))}
    </div>
  );
}
