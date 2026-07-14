import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { getCategories } from "@/lib/queries";
import { ProductForm } from "@/components/dashboard/product-form";
import { Button } from "@/components/ui/button";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function NewProductPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const ctx = await requireAuth();
  const params = await searchParams;
  const categories = await getCategories(ctx);

  const pick = (key: string) => {
    const v = params[key];
    return typeof v === "string" ? v : undefined;
  };

  const defaultValues = {
    barcode: pick("barcode") ?? "",
    name: pick("name") ?? "",
    brand: pick("brand") ?? "",
    description: pick("description") ?? "",
    imageUrl: pick("imageUrl") ?? "",
  };

  const imageSource = pick("imageSource");
  const imageAttribution = imageSource
    ? `Image from ${imageSource} (external catalog — not owned by NexaPOS)`
    : null;

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
            {defaultValues.barcode
              ? ` · barcode ${defaultValues.barcode}`
              : ""}
          </p>
        </div>
      </div>
      <ProductForm
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        defaultValues={defaultValues}
        imageAttribution={imageAttribution}
      />
    </div>
  );
}
