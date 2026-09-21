/**
 * Missing ModuleSetting rows stay enabled so existing businesses keep working
 * until Builder writes an explicit flag.
 */
export function isModuleSettingEnabled(
  setting: { enabled: boolean } | null | undefined
): boolean {
  return setting ? setting.enabled !== false : true;
}

/** Same check requireAuth uses after middleware stamps x-nexapos-module. */
export function enforceBusinessModule(
  setting: { enabled: boolean } | null | undefined,
  module: string
): void {
  if (!isModuleSettingEnabled(setting)) {
    throw new Error(`Module disabled: ${module}`);
  }
}
