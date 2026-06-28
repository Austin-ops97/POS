import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { getCategories } from "@/lib/queries";
import { db } from "@/lib/db";
import { ProductForm } from "@/components/dashboard/product-form";
import { Button } from "@/components/ui/button";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireAuth();

  const product = await db.product.findFirst({
    where: {
      id,
      businessId: ctx.business.id,
      deletedAt: null,
    },
  });

  if (!product) notFound();

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
          <h1 className="text-2xl font-bold text-slate-900">Edit Product</h1>
          <p className="text-sm text-slate-500">{product.name}</p>
        </div>
      </div>
      <ProductForm
        productId={product.id}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        defaultValues={{
          name: product.name,
          description: product.description ?? "",
          sku: product.sku ?? "",
          barcode: product.barcode ?? "",
          brand: product.brand ?? "",
          supplier: product.supplier ?? "",
          price: Number(product.price),
          cost: product.cost ? Number(product.cost) : 0,
          type: product.type,
          categoryId: product.categoryId ?? undefined,
          taxable: product.taxable,
          trackInventory: product.trackInventory,
          isActive: product.isActive,
        }}
      />
    </div>
  );
}
