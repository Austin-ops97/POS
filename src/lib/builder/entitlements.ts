import { MODULE_SETTING_KEYS } from "@/lib/validations";
import { isModuleSettingEnabled } from "@/lib/module-entitlement";

/** Grandfather rule: a missing row is on. An explicit false is off. */
export function resolveFeatureFlags(
  rows: Array<{ module: string; enabled: boolean }>
): Record<string, boolean> {
  const explicit = new Map(rows.map((row) => [row.module, row]));
  return Object.fromEntries(
    MODULE_SETTING_KEYS.map((key) => [key, isModuleSettingEnabled(explicit.get(key))])
  );
}
