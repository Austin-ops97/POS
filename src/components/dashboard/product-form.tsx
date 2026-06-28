"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { productSchema } from "@/lib/validations";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ProductFormValues = z.infer<typeof productSchema>;

type ProductFormProps = {
  categories: Array<{ id: string; name: string }>;
};

export function ProductForm({ categories }: ProductFormProps) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: "",
      description: "",
      sku: "",
      barcode: "",
      brand: "",
      supplier: "",
      price: 0,
      cost: 0,
      type: "PHYSICAL",
      taxable: true,
      trackInventory: true,
      isActive: true,
      initialStock: 0,
    },
  });

  const taxable = watch("taxable");
  const trackInventory = watch("trackInventory");
  const isActive = watch("isActive");
  const productType = watch("type");

  async function onSubmit(data: ProductFormValues) {
    const trackInventory =
      data.type === "PHYSICAL" ? (data.trackInventory ?? false) : false;

    const payload = {
      name: data.name,
      description: data.description || undefined,
      sku: data.sku || undefined,
      barcode: data.barcode || undefined,
      categoryId: data.categoryId || undefined,
      brand: data.brand || undefined,
      supplier: data.supplier || undefined,
      price: data.price,
      cost: data.cost || undefined,
      type: data.type,
      taxable: data.taxable,
      trackInventory,
      isActive: data.isActive,
      ...(trackInventory ? { initialStock: data.initialStock ?? 0 } : {}),
    };

    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        toast.error(err?.error ?? "Failed to create product");
        return;
      }

      toast.success("Product created");
      router.push("/products");
      router.refresh();
    } catch {
      toast.error("Failed to create product");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Product Name</Label>
            <Input id="name" {...register("name")} />
            {errors.name && (
              <p className="text-sm text-red-600">{errors.name.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" {...register("description")} rows={3} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sku">SKU</Label>
              <Input id="sku" {...register("sku")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="barcode">Barcode</Label>
              <Input id="barcode" {...register("barcode")} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <Select onValueChange={(v) => setValue("categoryId", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pricing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="price">Price</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0"
                {...register("price", { valueAsNumber: true })}
              />
              {errors.price && (
                <p className="text-sm text-red-600">{errors.price.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="cost">Cost</Label>
              <Input
                id="cost"
                type="number"
                step="0.01"
                min="0"
                {...register("cost", { valueAsNumber: true })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Product Type</Label>
            <Select
              value={productType}
              onValueChange={(v) => {
                setValue("type", v as ProductFormValues["type"]);
                if (v !== "PHYSICAL") {
                  setValue("trackInventory", false);
                  setValue("initialStock", 0);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PHYSICAL">Physical</SelectItem>
                <SelectItem value="SERVICE">Service</SelectItem>
                <SelectItem value="RENTAL">Rental</SelectItem>
                <SelectItem value="DIGITAL">Digital</SelectItem>
                <SelectItem value="CUSTOM">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Options</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Checkbox
              id="taxable"
              checked={taxable}
              onCheckedChange={(v) => setValue("taxable", v === true)}
            />
            <Label htmlFor="taxable">Taxable</Label>
          </div>
          <div className="flex items-center gap-3">
            <Checkbox
              id="trackInventory"
              checked={trackInventory}
              disabled={productType !== "PHYSICAL"}
              onCheckedChange={(v) => {
                const enabled = v === true;
                setValue("trackInventory", enabled);
                if (!enabled) {
                  setValue("initialStock", 0);
                }
              }}
            />
            <Label htmlFor="trackInventory">Track inventory</Label>
          </div>
          {productType === "PHYSICAL" && trackInventory && (
            <div className="space-y-2">
              <Label htmlFor="initialStock">Initial stock</Label>
              <Input
                id="initialStock"
                type="number"
                step="1"
                min="0"
                {...register("initialStock", { valueAsNumber: true })}
              />
              {errors.initialStock && (
                <p className="text-sm text-red-600">
                  {errors.initialStock.message}
                </p>
              )}
            </div>
          )}
          <div className="flex items-center gap-3">
            <Checkbox
              id="isActive"
              checked={isActive}
              onCheckedChange={(v) => setValue("isActive", v === true)}
            />
            <Label htmlFor="isActive">Active</Label>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creating..." : "Create Product"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
