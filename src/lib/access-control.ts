import { db } from "./db";
import type { AuthContext } from "./auth";
import { CUSTOMER_CONFIGURABLE_MODULES, type AppModuleKey } from "./modules";

const APP_MODULE_KEYS = new Set<string>(CUSTOMER_CONFIGURABLE_MODULES.map((item) => item.key));

export async function getBusinessModuleAccess(businessId: string) {
  const settings = await db.moduleSetting.findMany({
    where: { businessId, module: { in: [...APP_MODULE_KEYS] } },
    select: { module: true, enabled: true },
  });
  const explicit = new Map(settings.map((item) => [item.module, item.enabled]));
  return Object.fromEntries(
    CUSTOMER_CONFIGURABLE_MODULES.map(({ key }) => [key, explicit.get(key) ?? true])
  ) as Record<AppModuleKey, boolean>;
}

export async function getEmployeeModuleAccess(ctx: AuthContext) {
  const [businessAccess, overrides] = await Promise.all([
    getBusinessModuleAccess(ctx.business.id),
    db.employeeModuleAccess.findMany({
      where: { employeeId: ctx.employee.id, module: { in: [...APP_MODULE_KEYS] } },
      select: { module: true, enabled: true },
    }),
  ]);
  const overrideMap = new Map(overrides.map((item) => [item.module, item.enabled]));
  return Object.fromEntries(
    CUSTOMER_CONFIGURABLE_MODULES.map(({ key }) => [
      key,
      businessAccess[key] && (overrideMap.get(key) ?? true),
    ])
  ) as Record<AppModuleKey, boolean>;
}

export async function requireModule(ctx: AuthContext, module: AppModuleKey) {
  const access = await getEmployeeModuleAccess(ctx);
  if (!access[module]) throw new Error(`Module disabled: ${module}`);
}
