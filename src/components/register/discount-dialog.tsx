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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CartDiscount } from "@/stores/cart-store";

type DiscountDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (discount: CartDiscount) => void;
};

export function DiscountDialog({
  open,
  onOpenChange,
  onSubmit,
}: DiscountDialogProps) {
  const [type, setType] = useState<"PERCENTAGE" | "FIXED_AMOUNT">("PERCENTAGE");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setType("PERCENTAGE");
    setValue("");
    setError(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(value);
    if (Number.isNaN(parsed) || parsed <= 0) {
      setError("Enter a valid discount value");
      return;
    }
    if (type === "PERCENTAGE" && parsed > 100) {
      setError("Percentage cannot exceed 100");
      return;
    }
    onSubmit({
      id: `disc-${Date.now()}`,
      name: type === "PERCENTAGE" ? `${parsed}% Off` : `$${parsed.toFixed(2)} Off`,
      type,
      value: parsed,
    });
    handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add discount</DialogTitle>
            <DialogDescription>
              Apply a percentage or fixed amount off the order.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Discount type</Label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as "PERCENTAGE" | "FIXED_AMOUNT")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERCENTAGE">Percentage</SelectItem>
                  <SelectItem value="FIXED_AMOUNT">Fixed amount</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="discount-value">
                {type === "PERCENTAGE" ? "Percent" : "Amount ($)"}
              </Label>
              <Input
                id="discount-value"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={type === "PERCENTAGE" ? "10" : "5.00"}
                autoFocus
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
            <Button type="submit">Apply discount</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
