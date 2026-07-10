"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ONBOARDING_STEPS,
  getOnboardingStepIndex,
  resolveOnboardingStep,
  type OnboardingStepKey,
} from "@/lib/onboarding";

type PatchPayload = Record<string, unknown>;

export function useOnboarding() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [savedStep, setSavedStep] = useState<OnboardingStepKey>("WELCOME");
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const patchOnboarding = useCallback(
    async (step: OnboardingStepKey, data: PatchPayload, autoSave = false) => {
      const res = await fetch("/api/business/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step, autoSave, ...data }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save progress");
      }
      return res.json();
    },
    []
  );

  const scheduleAutoSave = useCallback(
    (step: OnboardingStepKey, data: PatchPayload) => {
      if (!businessId) return;
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = setTimeout(() => {
        void patchOnboarding(step, data, true).catch(() => {
          /* silent auto-save failure */
        });
      }, 800);
    },
    [businessId, patchOnboarding]
  );

  const loadBusiness = useCallback(async () => {
    try {
      const res = await fetch("/api/business");
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    async function init() {
      try {
        const biz = await loadBusiness();
        if (!biz) {
          setLoading(false);
          return;
        }

        if (biz.onboardingComplete && resolveOnboardingStep(biz.onboardingStep) === "COMPLETED") {
          router.push("/dashboard");
          return;
        }

        setBusinessId(biz.id);
        const step = resolveOnboardingStep(biz.onboardingStep);
        setSavedStep(step);
        setCurrentStep(getOnboardingStepIndex(step));
      } finally {
        setLoading(false);
      }
    }
    void init();
  }, [loadBusiness, router]);

  const goToStep = useCallback((index: number) => {
    setCurrentStep(Math.max(0, Math.min(index, ONBOARDING_STEPS.length - 1)));
  }, []);

  const advanceStep = useCallback(async () => {
    const nextIndex = currentStep + 1;
    if (nextIndex < ONBOARDING_STEPS.length) {
      setCurrentStep(nextIndex);
      return ONBOARDING_STEPS[nextIndex];
    }
    return null;
  }, [currentStep]);

  const completeOnboarding = useCallback(async () => {
    setSubmitting(true);
    try {
      await patchOnboarding("COMPLETED", { complete: true });
      router.push("/onboarding/complete");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to complete setup");
    } finally {
      setSubmitting(false);
    }
  }, [patchOnboarding, router]);

  const exitSetup = useCallback(async () => {
    setSubmitting(true);
    try {
      const step = ONBOARDING_STEPS[currentStep];
      await patchOnboarding(step, { complete: true, skipSetup: true });
      toast.success("Setup skipped — you can finish configuration anytime in Settings");
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not exit setup");
    } finally {
      setSubmitting(false);
    }
  }, [currentStep, patchOnboarding, router]);

  return {
    currentStep,
    stepKey: ONBOARDING_STEPS[currentStep],
    savedStep,
    loading,
    submitting,
    setSubmitting,
    businessId,
    setBusinessId,
    patchOnboarding,
    scheduleAutoSave,
    loadBusiness,
    goToStep,
    advanceStep,
    completeOnboarding,
    exitSetup,
    totalSteps: ONBOARDING_STEPS.length,
    progress: ((currentStep + 1) / ONBOARDING_STEPS.length) * 100,
  };
}
