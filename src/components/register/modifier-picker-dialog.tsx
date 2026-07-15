"use client";

import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

export type ModifierOptionChoice = {
  id: string;
  name: string;
  priceAdjustment: number;
};

export type ModifierGroupChoice = {
  id: string;
  name: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  options: ModifierOptionChoice[];
};

type ModifierPickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productName: string;
  basePrice: number;
  groups: ModifierGroupChoice[];
  onConfirm: (modifiers: { name: string; priceAdjustment: number }[]) => void;
};

export function ModifierPickerDialog({
  open,
  onOpenChange,
  productName,
  basePrice,
  groups,
  onConfirm,
}: ModifierPickerDialogProps) {
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setSelected({});
    setError(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const adjustmentTotal = useMemo(() => {
    let sum = 0;
    for (const group of groups) {
      const ids = selected[group.id] || [];
      for (const optId of ids) {
        const opt = group.options.find((o) => o.id === optId);
        if (opt) sum += opt.priceAdjustment;
      }
    }
    return sum;
  }, [groups, selected]);

  const toggleOption = (group: ModifierGroupChoice, optionId: string) => {
    setSelected((prev) => {
      const current = prev[group.id] || [];
      const multi = group.maxSelect > 1;
      if (multi) {
        if (current.includes(optionId)) {
          return { ...prev, [group.id]: current.filter((id) => id !== optionId) };
        }
        if (current.length >= group.maxSelect) {
          return { ...prev, [group.id]: [...current.slice(1), optionId] };
        }
        return { ...prev, [group.id]: [...current, optionId] };
      }
      return { ...prev, [group.id]: current[0] === optionId ? [] : [optionId] };
    });
  };

  const handleConfirm = () => {
    for (const group of groups) {
      const count = (selected[group.id] || []).length;
      const min = group.required ? Math.max(1, group.minSelect) : group.minSelect;
      if (count < min) {
        setError(`Select at least ${min} for ${group.name}`);
        return;
      }
      if (count > group.maxSelect) {
        setError(`Select at most ${group.maxSelect} for ${group.name}`);
        return;
      }
    }
    const modifiers: { name: string; priceAdjustment: number }[] = [];
    for (const group of groups) {
      for (const optId of selected[group.id] || []) {
        const opt = group.options.find((o) => o.id === optId);
        if (opt) {
          modifiers.push({
            name: `${group.name}: ${opt.name}`,
            priceAdjustment: opt.priceAdjustment,
          });
        }
      }
    }
    onConfirm(modifiers);
    handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{productName}</DialogTitle>
          <DialogDescription>
            Customize options before adding to the cart.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {groups.map((group) => (
            <fieldset key={group.id} className="space-y-2">
              <legend className="text-sm font-semibold text-slate-900">
                {group.name}
                {group.required || group.minSelect > 0 ? (
                  <span className="ml-1 font-normal text-slate-500">(required)</span>
                ) : null}
              </legend>
              <div className="space-y-1">
                {group.options.map((opt) => {
                  const checked = (selected[group.id] || []).includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => toggleOption(group, opt.id)}
                      className={`flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left text-sm transition-colors ${
                        checked
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
                      }`}
                      aria-pressed={checked}
                    >
                      <span>{opt.name}</span>
                      <span className={checked ? "text-slate-200" : "text-slate-500"}>
                        {opt.priceAdjustment === 0
                          ? "Included"
                          : opt.priceAdjustment > 0
                            ? `+${formatCurrency(opt.priceAdjustment)}`
                            : formatCurrency(opt.priceAdjustment)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}
          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
          <p className="text-sm text-slate-600">
            Total{" "}
            <span className="font-semibold text-slate-900">
              {formatCurrency(basePrice + adjustmentTotal)}
            </span>
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm}>
            Add to cart
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
