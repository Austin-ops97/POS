"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QuantityStepper } from "@/components/ui/quantity-stepper";

type CustomItemDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (item: { name: string; unitPrice: number; quantity: number }) => void;
};

export function CustomItemDialog({
  open,
  onOpenChange,
  onSubmit,
}: CustomItemDialogProps) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setPrice("");
    setQuantity(1);
    setError(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    const parsed = parseFloat(price);
    if (!trimmed) {
      setError("Enter an item name");
      return;
    }
    if (Number.isNaN(parsed) || parsed < 0) {
      setError("Enter a valid price");
      return;
    }
    onSubmit({ name: trimmed, unitPrice: parsed, quantity });
    handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add custom item</DialogTitle>
            <DialogDescription>
              Add a one-off item that is not in your catalog.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="custom-item-name">Item name</Label>
              <Input
                id="custom-item-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Special request"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-item-price">Price</Label>
              <Input
                id="custom-item-price"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-item-qty">Quantity</Label>
              <QuantityStepper
                id="custom-item-qty"
                value={quantity}
                onChange={setQuantity}
                min={1}
                aria-label="Custom item quantity"
              />
            </div>
            {error ? (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Add to cart</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
