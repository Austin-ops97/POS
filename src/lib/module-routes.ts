/**
 * Maps a request path to the ModuleSetting key enforced by requireAuth.
 * Longer prefixes are listed first so payroll, banking, and projects
 * are not swallowed by their parent modules.
 */
const MODULE_ROUTES: Array<[string, string]> = [
  ["/api/workforce/payroll", "PAYROLL"],
  ["/workforce/payroll", "PAYROLL"],
  ["/api/workforce/shifts", "SCHEDULING"],
  ["/api/workforce/schedule", "SCHEDULING"],
  ["/api/workforce/availability", "SCHEDULING"],
  ["/workforce/schedule", "SCHEDULING"],
  ["/workforce/availability", "SCHEDULING"],
  ["/api/integrations/quickbooks", "QUICKBOOKS"],
  ["/settings/integrations/quickbooks", "QUICKBOOKS"],
  ["/api/integrations/plaid", "BANKING"],
  ["/settings/integrations/banking", "BANKING"],
  ["/api/finance/profit-loss", "ACCOUNTING"],
  ["/api/finance/tax-summary", "ACCOUNTING"],
  ["/api/finance/tax-mappings", "ACCOUNTING"],
  ["/finance/reports/profit-loss", "ACCOUNTING"],
  ["/finance/reports/tax", "ACCOUNTING"],
  ["/api/social", "SOCIAL"],
  ["/api/integrations/social", "SOCIAL"],
  ["/api/integrations/meta", "SOCIAL"],
  ["/api/integrations/linkedin", "SOCIAL"],
  ["/settings/integrations/social", "SOCIAL"],
  ["/api/import", "IMPORT"],
  ["/settings/import", "IMPORT"],
  ["/finance/transactions", "BANKING"],
  ["/finance/statements", "BANKING"],
  ["/api/expenses/statements", "BANKING"],
  ["/api/office/projects", "PROJECTS"],
  ["/office/apps/projects", "PROJECTS"],
  ["/api/office/reminders", "PROJECT_REMINDERS"],
  ["/office/reminders", "PROJECT_REMINDERS"],
  ["/api/office/approvals", "PROJECT_COMPLETION"],
  ["/office/approvals", "PROJECT_COMPLETION"],
  ["/api/checkout", "POS"],
  ["/register", "POS"],
  ["/api/stripe", "PAYMENTS"],
  ["/payments", "PAYMENTS"],
  ["/api/products", "CATALOG"],
  ["/products", "CATALOG"],
  ["/api/inventory", "INVENTORY"],
  ["/inventory", "INVENTORY"],
  ["/api/orders", "ORDERS"],
  ["/orders", "ORDERS"],
  ["/api/customers", "CUSTOMERS"],
  ["/customers", "CUSTOMERS"],
  ["/api/reports", "REPORTS"],
  ["/reports", "REPORTS"],
  ["/api/employees", "WORKFORCE"],
  ["/api/workforce", "WORKFORCE"],
  ["/employees", "WORKFORCE"],
  ["/workforce", "WORKFORCE"],
  ["/api/connections", "CONNECTIONS"],
  ["/connections", "CONNECTIONS"],
  ["/api/expenses", "EXPENSES"],
  ["/finance", "EXPENSES"],
  ["/api/office", "OFFICE"],
  ["/office", "OFFICE"],
];

export function moduleForPath(pathname: string): string | null {
  const path = pathname.split("?")[0] || pathname;
  if (path.startsWith("/api/office/workspaces/projects")) return "PROJECTS";
  if (/^\/api\/office\/projects\/[^/]+\/reminders(?:\/|$)/.test(path)) {
    return "PROJECT_REMINDERS";
  }
  return MODULE_ROUTES.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`))?.[1] || null;
}
