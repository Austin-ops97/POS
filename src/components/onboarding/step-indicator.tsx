"use client";

import type React from "react";
import {
  Building2,
  MapPin,
  Percent,
  Receipt,
  CreditCard,
  Package,
  Users,
  Sparkles,
  Store,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ONBOARDING_STEPS,
  ONBOARDING_STEP_LABELS,
  type OnboardingStepKey,
} from "@/lib/onboarding";
import { Progress } from "@/components/ui/progress";

const STEP_ICONS: Record<OnboardingStepKey, React.ComponentType<{ className?: string }>> = {
  WELCOME: Sparkles,
  BUSINESS_INFO: Building2,
  BUSINESS_TYPE: Store,
  BUSINESS_ADDRESS: MapPin,
  TAX_SETTINGS: Percent,
  RECEIPT_SETTINGS: Receipt,
  STRIPE_CONNECT: CreditCard,
  IMPORT_PRODUCTS: Package,
  INVITE_EMPLOYEES: Users,
  COMPLETED: Check,
};

type StepIndicatorProps = {
  currentStep: number;
  className?: string;
};

export function StepIndicator({ currentStep, className }: StepIndicatorProps) {
  const progress = ((currentStep + 1) / ONBOARDING_STEPS.length) * 100;

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-slate-700">
          Step {currentStep + 1} of {ONBOARDING_STEPS.length}
        </span>
        <span className="text-slate-500">
          {ONBOARDING_STEP_LABELS[ONBOARDING_STEPS[currentStep]]}
        </span>
      </div>
      <Progress value={progress} />

      <ol className="hidden gap-1 md:grid md:grid-cols-10">
        {ONBOARDING_STEPS.map((key, i) => {
          const Icon = STEP_ICONS[key];
          const isActive = i === currentStep;
          const isComplete = i < currentStep;
          return (
            <li key={key} className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full border-2 transition-colors",
                  isComplete
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : isActive
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-400"
                )}
              >
                {isComplete ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </div>
              <span
                className={cn(
                  "text-center text-[10px] font-medium leading-tight",
                  isActive ? "text-slate-900" : "text-slate-400"
                )}
              >
                {ONBOARDING_STEP_LABELS[key]}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
