export const ONBOARDING_STEPS = [
  "WELCOME",
  "BUSINESS_INFO",
  "BUSINESS_TYPE",
  "BUSINESS_ADDRESS",
  "TAX_SETTINGS",
  "RECEIPT_SETTINGS",
  "STRIPE_CONNECT",
  "IMPORT_PRODUCTS",
  "INVITE_EMPLOYEES",
  "COMPLETED",
] as const;

export type OnboardingStepKey = (typeof ONBOARDING_STEPS)[number];

/** Maps legacy onboarding step values to the current wizard steps. */
export const LEGACY_ONBOARDING_STEP_MAP: Record<string, OnboardingStepKey> = {
  BUSINESS_PROFILE: "BUSINESS_INFO",
  LOCATION_SETUP: "BUSINESS_ADDRESS",
  POS_CONFIG: "TAX_SETTINGS",
  FIRST_PRODUCTS: "IMPORT_PRODUCTS",
  CHOOSE_PLAN: "INVITE_EMPLOYEES",
};

export function resolveOnboardingStep(step: string): OnboardingStepKey {
  if ((ONBOARDING_STEPS as readonly string[]).includes(step)) {
    return step as OnboardingStepKey;
  }
  return LEGACY_ONBOARDING_STEP_MAP[step] ?? "WELCOME";
}

export function getOnboardingStepIndex(step: string): number {
  const resolved = resolveOnboardingStep(step);
  const index = ONBOARDING_STEPS.indexOf(resolved);
  return index >= 0 ? index : 0;
}

export const ONBOARDING_STEP_LABELS: Record<OnboardingStepKey, string> = {
  WELCOME: "Welcome",
  BUSINESS_INFO: "Business",
  BUSINESS_TYPE: "Industry",
  BUSINESS_ADDRESS: "Address",
  TAX_SETTINGS: "Taxes",
  RECEIPT_SETTINGS: "Receipts",
  STRIPE_CONNECT: "Payments",
  IMPORT_PRODUCTS: "Products",
  INVITE_EMPLOYEES: "Team",
  COMPLETED: "Complete",
};
