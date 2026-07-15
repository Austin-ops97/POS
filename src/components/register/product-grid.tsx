"use client";

import Image from "next/image";
import { Package } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import type { ModifierGroupChoice } from "@/components/register/modifier-picker-dialog";

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
  modifierGroups?: ModifierGroupChoice[];
};

type ProductGridProps = {
  products: ProductGridItem[];
  loading?: boolean;
  onSelect: (product: ProductGridItem) => void;
  className?: string;
};

function ProductThumb({ name, imageUrl }: { name: string; imageUrl?: string | null }) {
  if (imageUrl) {
    return (
      <div className="relative mb-2 aspect-[4/3] w-full overflow-hidden rounded-lg bg-slate-100">
        <Image
          src={imageUrl}
          alt=""
          fill
          sizes="(max-width: 768px) 45vw, 160px"
          className="object-cover"
          unoptimized
        />
      </div>
    );
  }
  return (
    <div className="mb-2 flex aspect-[4/3] w-full items-center justify-center rounded-lg bg-slate-100">
      <Package className="h-8 w-8 text-slate-300" aria-hidden="true" />
      <span className="sr-only">{name}</span>
    </div>
  );
}

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
            className="h-40 animate-pulse rounded-xl border border-slate-200 bg-slate-100"
          />
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 py-16 text-center">
        <Package className="mb-3 h-10 w-10 text-slate-300" aria-hidden="true" />
        <p className="text-sm font-medium text-slate-600">No products found</p>
        <p className="mt-1 text-xs text-slate-500">
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
          className="group flex min-h-[7rem] flex-col items-stretch rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition-all hover:border-slate-300 hover:shadow-md active:scale-[0.98]"
        >
          <ProductThumb name={product.name} imageUrl={product.imageUrl} />
          <div className="flex flex-1 flex-col justify-between">
            <div className="w-full">
              <p className="line-clamp-2 text-base font-semibold text-slate-900 group-hover:text-slate-700">
                {product.name}
              </p>
              {product.sku ? (
                <p className="mt-1 text-xs text-slate-500">{product.sku}</p>
              ) : null}
            </div>
            <p className="mt-2 text-lg font-bold text-slate-900">
              {formatCurrency(product.price)}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}
