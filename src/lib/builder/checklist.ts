export const CHECKLIST_STEPS = [
  { key: "businessReady", label: "Business record created" },
  { key: "planApplied", label: "Subscription plan applied" },
  { key: "featuresReviewed", label: "Feature overrides reviewed" },
  { key: "integrationsConfirmed", label: "Required integrations confirmed" },
  { key: "ownerInvited", label: "Owner invited" },
] as const;

export type ChecklistKey = (typeof CHECKLIST_STEPS)[number]["key"];
export type ChecklistState = Record<ChecklistKey, boolean>;

export function emptyChecklist(): ChecklistState {
  return {
    businessReady: false,
    planApplied: false,
    featuresReviewed: false,
    integrationsConfirmed: false,
    ownerInvited: false,
  };
}

export function parseChecklist(value: unknown): ChecklistState {
  const base = emptyChecklist();
  if (!value || typeof value !== "object") return base;
  const record = value as Record<string, unknown>;
  for (const step of CHECKLIST_STEPS) {
    const value = record[step.key];
    if (typeof value === "boolean") base[step.key] = value;
  }
  return base;
}

export function mergeChecklist(current: unknown, patch: Partial<ChecklistState>): ChecklistState {
  return { ...parseChecklist(current), ...patch };
}
