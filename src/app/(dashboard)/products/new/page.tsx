import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { getCategories } from "@/lib/queries";
import { ProductForm } from "@/components/dashboard/product-form";
import { Button } from "@/components/ui/button";

export default async function NewProductPage() {
  const ctx = await requireAuth();

  const categories = await getCategories(ctx);

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
