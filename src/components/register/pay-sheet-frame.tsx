"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { PAY_DIALOG_Z_INDEX } from "@/lib/register/pay-sheet";

type PaySheetFrameProps = {
  open: boolean;
  titleId: string;
  descId: string;
  onDismiss?: () => void;
  dismissDisabled?: boolean;
  wide?: boolean;
  children: React.ReactNode;
};

/**
 * Full-viewport pay sheet below the `lg` cart breakpoint. The desktop scrim
 * stays hidden there so a navy overlay cannot cover Cash, Card, or Tap to Pay.
 * Portaled to document.body so it stacks above the Current Sale sheet.
 */
export function PaySheetFrame({
  open,
  titleId,
  descId,
  onDismiss,
  dismissDisabled,
  wide,
  children,
}: PaySheetFrameProps) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-stretch justify-center lg:items-center lg:p-4"
      style={{ zIndex: PAY_DIALOG_Z_INDEX }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <button
        type="button"
        className="absolute inset-0 hidden bg-slate-900/60 backdrop-blur-sm lg:block"
        aria-label="Dismiss payment"
        disabled={dismissDisabled || !onDismiss}
        onClick={dismissDisabled ? undefined : onDismiss}
      />
      <div
        className={cn(
          "relative flex h-dvh max-h-dvh w-full flex-col overflow-y-auto overscroll-contain bg-white",
          "px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]",
          "lg:h-auto lg:max-h-[min(90dvh,900px)] lg:rounded-2xl lg:border lg:border-slate-200 lg:pt-8 lg:shadow-2xl",
          wide ? "lg:max-w-lg" : "lg:max-w-md"
        )}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
