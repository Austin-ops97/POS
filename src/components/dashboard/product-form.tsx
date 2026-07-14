"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Camera } from "lucide-react";
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
import { BarcodeScanner } from "@/components/barcode/barcode-scanner";

type ProductFormValues = z.infer<typeof productSchema>;

type ProductFormProps = {
  categories: Array<{ id: string; name: string }>;
  productId?: string;
  defaultValues?: Partial<ProductFormValues>;
  imageAttribution?: string | null;
};

export function ProductForm({
  categories,
  productId,
  defaultValues,
  imageAttribution,
}: ProductFormProps) {
  const router = useRouter();
  const isEditing = Boolean(productId);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [barcodeConflict, setBarcodeConflict] = useState<{
    message: string;
    productId?: string;
  } | null>(null);
  const attribution = imageAttribution ?? "";

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
      imageUrl: "",
      price: 0,
      cost: 0,
      type: "PHYSICAL",
      taxable: true,
      trackInventory: true,
      isActive: true,
      initialStock: 0,
      ...defaultValues,
    },
  });

  const taxable = watch("taxable");
  const trackInventory = watch("trackInventory");
  const isActive = watch("isActive");
  const productType = watch("type");
  const imageUrl = watch("imageUrl");

  async function checkBarcodeConflict(code: string) {
    if (!code.trim()) {
      setBarcodeConflict(null);
      return;
    }
    try {
      const res = await fetch(
        `/api/catalog/barcodes/${encodeURIComponent(code)}?localOnly=true`
      );
      if (!res.ok) return;
      const data = await res.json();
      if (
        data.status === "LOCAL_MATCH" &&
        data.product?.id &&
        data.product.id !== productId
      ) {
        setBarcodeConflict({
          message: `Already assigned to ${data.product.name}`,
          productId: data.product.id,
        });
      } else {
        setBarcodeConflict(null);
      }
    } catch {
      /* ignore */
    }
  }

  async function onSubmit(data: ProductFormValues) {
    if (barcodeConflict) {
      toast.error("Resolve the barcode conflict before saving");
      return;
    }

    const trackInventoryValue =
      data.type === "PHYSICAL" ? (data.trackInventory ?? false) : false;

    const payload = {
      name: data.name,
      description: data.description || undefined,
      sku: data.sku || undefined,
      barcode: data.barcode || undefined,
      categoryId: data.categoryId || undefined,
      brand: data.brand || undefined,
      supplier: data.supplier || undefined,
      imageUrl: data.imageUrl || undefined,
      imageAttribution: attribution || undefined,
      price: data.price,
      cost: data.cost || undefined,
      type: data.type,
      taxable: data.taxable,
      trackInventory: trackInventoryValue,
      isActive: data.isActive,
      ...(trackInventoryValue ? { initialStock: data.initialStock ?? 0 } : {}),
    };

    try {
      const url = isEditing ? `/api/products/${productId}` : "/api/products";
      const method = isEditing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as {
          error?: string;
          code?: string;
          existingProductId?: string;
        } | null;
        if (err?.code === "DUPLICATE_BARCODE" && err.existingProductId) {
          setBarcodeConflict({
            message: err.error ?? "Barcode already assigned",
            productId: err.existingProductId,
          });
        }
        toast.error(err?.error ?? `Failed to ${isEditing ? "update" : "create"} product`);
        return;
      }

      toast.success(isEditing ? "Product updated" : "Product created");
      router.push("/products");
      router.refresh();
    } catch {
      toast.error("Failed to create product");
    }
  }

  return (
    <>
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
                <div className="flex gap-2">
                  <Input
                    id="barcode"
                    {...register("barcode", {
                      onChange: (e) => {
                        void checkBarcodeConflict(e.target.value);
                      },
                    })}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Scan barcode"
                    onClick={() => setScannerOpen(true)}
                  >
                    <Camera className="h-4 w-4" />
                  </Button>
                </div>
                {barcodeConflict && (
                  <p className="text-sm text-red-600">
                    {barcodeConflict.message}
                    {barcodeConflict.productId && (
                      <>
                        {" · "}
                        <Link
                          className="underline"
                          href={`/products/${barcodeConflict.productId}`}
                        >
                          Open existing product
                        </Link>
                      </>
                    )}
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                defaultValue={defaultValues?.categoryId}
                onValueChange={(v) => setValue("categoryId", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {imageUrl ? (
              <div className="space-y-2">
                <Label>Product image</Label>
                {/* External / merchant image preview */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt="Product"
                  className="h-24 w-24 rounded object-contain"
                />
                {attribution && (
                  <p className="text-xs text-slate-500">{attribution}</p>
                )}
                <input type="hidden" {...register("imageUrl")} />
              </div>
            ) : null}
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
          <Button type="submit" disabled={isSubmitting || Boolean(barcodeConflict)}>
            {isSubmitting
              ? isEditing
                ? "Saving..."
                : "Creating..."
              : isEditing
                ? "Save Product"
                : "Create Product"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>

      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        continuous={false}
        title="Scan product barcode"
        onScan={(result) => {
          setValue("barcode", result.rawValue, { shouldDirty: true });
          void checkBarcodeConflict(result.rawValue);
          toast.success(`Scanned ${result.rawValue}`);
        }}
      />
    </>
  );
}
