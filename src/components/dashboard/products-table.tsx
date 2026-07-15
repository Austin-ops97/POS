"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Package, Plus, Search, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatCurrency } from "@/lib/utils";

export type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  price: number;
  categoryId: string | null;
  categoryName: string | null;
  isActive: boolean;
  stock: number | null;
};

type ProductsTableProps = {
  products: ProductRow[];
  categories: Array<{ id: string; name: string }>;
};

export function ProductsTable({ products, categories }: ProductsTableProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ProductRow | null>(null);

  async function confirmDelete() {
    if (!pendingDelete) return;
    const product = pendingDelete;
    setDeletingId(product.id);
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast.error(err?.error ?? "Failed to delete product");
        return;
      }
      toast.success("Product deleted");
      setPendingDelete(null);
      router.refresh();
    } catch {
      toast.error("Failed to delete product");
    } finally {
      setDeletingId(null);
    }
  }

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchesSearch =
        !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.sku?.toLowerCase().includes(search.toLowerCase());
      const matchesCategory =
        categoryId === "all" || p.categoryId === categoryId;
      return matchesSearch && matchesCategory;
    });
  }, [products, search, categoryId]);

  if (products.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title="No products yet"
        description="Add your first product to start selling."
        actionLabel="Add Product"
        actionHref="/products/new"
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <Input
              placeholder="Search products..."
              aria-label="Search products"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              enterKeyHint="search"
            />
          </div>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button asChild className="w-full sm:w-auto">
          <Link href="/products/new">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add Product
          </Link>
        </Button>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-slate-500">
          No products match your filters.
        </p>
      ) : (
        <>
          <ul className="space-y-3 md:hidden">
            {filtered.map((product) => (
              <li
                key={product.id}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{product.name}</p>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {product.sku || "No SKU"} · {product.categoryName || "Uncategorized"}
                    </p>
                  </div>
                  <Badge variant={product.isActive ? "success" : "secondary"}>
                    {product.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold text-slate-900">{formatCurrency(product.price)}</p>
                    <p className="text-sm text-slate-500">
                      Stock: {product.stock !== null ? product.stock : "—"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="icon" asChild aria-label={`Edit ${product.name}`}>
                      <Link href={`/products/${product.id}`}>
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setPendingDelete(product)}
                      disabled={deletingId === product.id}
                      aria-label={`Delete ${product.name}`}
                      className="text-red-600"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Product</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">SKU</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Category</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Price</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Stock</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((product) => (
                  <tr key={product.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="max-w-[14rem] truncate px-4 py-3 font-medium text-slate-900">{product.name}</td>
                    <td className="px-4 py-3 text-slate-600">{product.sku || "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{product.categoryName || "—"}</td>
                    <td className="px-4 py-3 text-slate-900">{formatCurrency(product.price)}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {product.stock !== null ? product.stock : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={product.isActive ? "success" : "secondary"}>
                        {product.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" asChild aria-label={`Edit ${product.name}`}>
                          <Link href={`/products/${product.id}`}>
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setPendingDelete(product)}
                          disabled={deletingId === product.id}
                          aria-label={`Delete ${product.name}`}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" aria-hidden="true" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="Delete product?"
        description={
          pendingDelete
            ? `Delete "${pendingDelete.name}"? This will deactivate the product.`
            : ""
        }
        confirmLabel="Delete"
        variant="destructive"
        loading={Boolean(deletingId)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
