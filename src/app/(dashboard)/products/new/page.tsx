import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ProductForm } from "@/components/dashboard/product-form";
import { Button } from "@/components/ui/button";

export default async function NewProductPage() {
  const ctx = await requireAuth();

  const categories = await db.category.findMany({
    where: { businessId: ctx.business.id, isActive: true, deletedAt: null },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/products">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Add Product</h1>
          <p className="text-sm text-slate-500">
            Create a new product in your catalog
          </p>
        </div>
      </div>
      <ProductForm categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
    </div>
  );
}
