"use client";

import { useEffect, useId, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { parseQuantityInput } from "@/lib/inventory-quantity";

type QuantityStepperProps = {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  size?: "sm" | "default";
  tone?: "light" | "dark";
  className?: string;
};

export function QuantityStepper({
  value,
  onChange,
  min = 0,
  max,
  disabled,
  id,
  "aria-label": ariaLabel = "Quantity",
  size = "default",
  tone = "light",
  className,
}: QuantityStepperProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [draft, setDraft] = useState(String(value));
  const compact = size === "sm";
  const dark = tone === "dark";

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  function commit(raw: string) {
    const parsed = parseQuantityInput(raw);
    if (parsed === null) {
      setDraft(String(value));
      return;
    }
    let next = parsed;
    if (next < min) next = min;
    if (max !== undefined && next > max) next = max;
    setDraft(String(next));
    if (next !== value) onChange(next);
  }

  function step(delta: number) {
    let next = value + delta;
    if (next < min) next = min;
    if (max !== undefined && next > max) next = max;
    if (next !== value) onChange(next);
  }

  const buttonClass = cn(
    "shrink-0 rounded-lg",
    compact ? "h-10 w-10 min-h-10 min-w-10" : "h-11 w-11"
  );

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        type="button"
        variant={dark ? "secondary" : "outline"}
        size="icon"
        className={buttonClass}
        onClick={() => step(-1)}
        disabled={disabled || value <= min}
        aria-label={`Decrease ${ariaLabel}`}
      >
        <Minus className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Input
        id={inputId}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(draft);
          }
        }}
        className={cn(
          "text-center text-base font-semibold tabular-nums",
          compact ? "h-10 w-14" : "h-11 w-16",
          dark && "border-slate-600 bg-slate-700 text-white"
        )}
        aria-label={ariaLabel}
      />
      <Button
        type="button"
        variant={dark ? "secondary" : "outline"}
        size="icon"
        className={buttonClass}
        onClick={() => step(1)}
        disabled={disabled || (max !== undefined && value >= max)}
        aria-label={`Increase ${ariaLabel}`}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
