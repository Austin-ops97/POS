import { MODULE_SETTING_KEYS } from "@/lib/validations";
import { CUSTOMER_CONFIGURABLE_MODULES } from "@/lib/modules";

export const BUILDER_PLAN_KEYS = ["STARTER", "PRO", "ENTERPRISE"] as const;
export type BuilderPlanKey = (typeof BUILDER_PLAN_KEYS)[number];

const NOT_IN_PRESETS = ["SERVICE", "RENTAL", "RESTAURANT", "LOYALTY", "GIFT_CARDS"] as const;

const STARTER_MODULES = [
  "POS",
  "PAYMENTS",
  "CATALOG",
  "INVENTORY",
  "ORDERS",
  "CUSTOMERS",
  "RETAIL",
] as const;

const PRO_MODULES = [
  ...STARTER_MODULES,
  "WORKFORCE",
  "SCHEDULING",
  "EXPENSES",
  "OFFICE",
  "PROJECTS",
  "REPORTS",
  "CONNECTIONS",
  "BANKING",
  "ACCOUNTING",
  "IMPORT",
  "ORDER_TERMINATION",
] as const;

export type PlanIntegrationId = "stripe" | "plaid" | "quickbooks" | "meta" | "linkedin";

export type PlanIntegration = {
  id: PlanIntegrationId;
  label: string;
  note: string;
};

const INTEGRATIONS: Record<PlanIntegrationId, PlanIntegration> = {
  stripe: {
    id: "stripe",
    label: "Stripe",
    note: "Platform keys in the environment. The business finishes Connect in Payments settings.",
  },
  plaid: {
    id: "plaid",
    label: "Plaid",
    note: "Platform Plaid app credentials. The business links a bank with Plaid. EmeraldOne does not collect bank passwords.",
  },
  quickbooks: {
    id: "quickbooks",
    label: "QuickBooks",
    note: "Platform Intuit app credentials. The business completes Intuit OAuth in its workspace.",
  },
  meta: {
    id: "meta",
    label: "Meta (Facebook and Instagram)",
    note: "Platform Meta app credentials. The business authorizes Pages in Social settings.",
  },
  linkedin: {
    id: "linkedin",
    label: "LinkedIn",
    note: "Platform LinkedIn app credentials. The business authorizes the organization in Social settings.",
  },
};

export const BUILDER_PLANS: Record<
  BuilderPlanKey,
  { label: string; description: string; modules: readonly string[]; integrations: PlanIntegrationId[] }
> = {
  STARTER: {
    label: "Starter",
    description: "Register, catalog, inventory, orders, customers, and payments.",
    modules: STARTER_MODULES,
    integrations: ["stripe"],
  },
  PRO: {
    label: "Pro",
    description: "Starter plus workforce, scheduling, expenses, office, projects, banking, import, and accounting reports.",
    modules: PRO_MODULES,
    integrations: ["stripe", "plaid"],
  },
  ENTERPRISE: {
    label: "Enterprise",
    description: "Every shipped module, including payroll, QuickBooks, and social publishing.",
    modules: MODULE_SETTING_KEYS.filter((key) => !(NOT_IN_PRESETS as readonly string[]).includes(key)),
    integrations: ["stripe", "plaid", "quickbooks", "meta", "linkedin"],
  },
};

export function isBuilderPlanKey(value: string): value is BuilderPlanKey {
  return (BUILDER_PLAN_KEYS as readonly string[]).includes(value);
}

/** Explicit on/off for every ModuleSetting key. Modules outside the plan are off. */
export function moduleFlagsForPlan(planKey: BuilderPlanKey): Record<string, boolean> {
  const enabled = new Set<string>(BUILDER_PLANS[planKey].modules);
  return Object.fromEntries(MODULE_SETTING_KEYS.map((key) => [key, enabled.has(key)]));
}

export function planDiverged(planKey: string, actual: Record<string, boolean>): boolean {
  if (!isBuilderPlanKey(planKey)) return false;
  const expected = moduleFlagsForPlan(planKey);
  return MODULE_SETTING_KEYS.some((key) => expected[key] !== Boolean(actual[key]));
}

export function planIntegrations(planKey: string): PlanIntegration[] {
  if (!isBuilderPlanKey(planKey)) return [];
  return BUILDER_PLANS[planKey].integrations.map((id) => INTEGRATIONS[id]);
}

const EXTRA_FEATURES: Array<{ key: string; name: string; description: string }> = [
  { key: "RETAIL", name: "Retail vertical", description: "Legacy retail flag kept on so existing setups do not change" },
  { key: "SERVICE", name: "Service vertical", description: "Not shipped. Leave off unless you are testing it" },
  { key: "RENTAL", name: "Rental vertical", description: "Not shipped. Leave off unless you are testing it" },
  { key: "RESTAURANT", name: "Restaurant vertical", description: "Not shipped. Leave off unless you are testing it" },
  { key: "LOYALTY", name: "Loyalty", description: "Not shipped. Leave off unless you are testing it" },
  { key: "GIFT_CARDS", name: "Gift cards", description: "Not shipped. Leave off unless you are testing it" },
];

const FEATURE_LOOKUP = new Map<string, { name: string; description: string }>([
  ...CUSTOMER_CONFIGURABLE_MODULES.map((item) => [item.key, { name: item.name, description: item.description }] as const),
  ...EXTRA_FEATURES.map((item) => [item.key, { name: item.name, description: item.description }] as const),
]);

export const BUILDER_FEATURE_GROUPS: Array<{ id: string; label: string; keys: readonly string[] }> = [
  {
    id: "sales",
    label: "Register and sales",
    keys: ["POS", "PAYMENTS", "CATALOG", "INVENTORY", "ORDERS", "CUSTOMERS", "ORDER_TERMINATION"],
  },
  {
    id: "people",
    label: "People",
    keys: ["WORKFORCE", "SCHEDULING", "PAYROLL", "CONNECTIONS", "VIDEO_CALLING"],
  },
  {
    id: "office",
    label: "Office and projects",
    keys: ["OFFICE", "PROJECTS", "PROJECT_REMINDERS", "PROJECT_COMPLETION"],
  },
  {
    id: "finance",
    label: "Finance and books",
    keys: ["EXPENSES", "BANKING", "ACCOUNTING", "REPORTS", "IMPORT", "QUICKBOOKS"],
  },
  { id: "social", label: "Social", keys: ["SOCIAL"] },
  {
    id: "verticals",
    label: "Verticals",
    keys: ["RETAIL", "SERVICE", "RENTAL", "RESTAURANT", "LOYALTY", "GIFT_CARDS"],
  },
];

export function builderFeatureCatalog() {
  return BUILDER_FEATURE_GROUPS.map((group) => ({
    ...group,
    features: group.keys.map((key) => ({
      key,
      name: FEATURE_LOOKUP.get(key)?.name ?? key,
      description: FEATURE_LOOKUP.get(key)?.description ?? "",
    })),
  }));
}
