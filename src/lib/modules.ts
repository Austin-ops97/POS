import { MODULE_SETTING_KEYS } from "./validations";

/** Canonical module keys used for ModuleSetting records. */
export const CANONICAL_MODULE_KEYS = MODULE_SETTING_KEYS;

/**
 * Every implemented module enabled by default for newly provisioned businesses.
 */
export function defaultEnabledModules(): Array<{
  module: (typeof MODULE_SETTING_KEYS)[number];
  enabled: boolean;
}> {
  return MODULE_SETTING_KEYS.map((module) => ({
    module,
    enabled: true,
  }));
}

/** Normalize legacy lowercase / alias module keys to canonical uppercase. */
export function normalizeModuleKey(key: string): string {
  const aliases: Record<string, string> = {
    retail: "RETAIL",
    service: "SERVICE",
    rental: "RENTAL",
    restaurant: "RESTAURANT",
    loyalty: "LOYALTY",
    gift_cards: "GIFT_CARDS",
    giftcards: "GIFT_CARDS",
    inventory: "RETAIL",
    expenses: "EXPENSES",
    finance: "EXPENSES",
    expense_management: "EXPENSES",
  };
  const lower = key.toLowerCase();
  if (aliases[lower]) return aliases[lower];
  const upper = key.toUpperCase();
  if ((MODULE_SETTING_KEYS as readonly string[]).includes(upper)) return upper;
  return upper;
}
