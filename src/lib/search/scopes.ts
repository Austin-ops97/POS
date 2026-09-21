import { PERMISSIONS } from "@/lib/permissions";

export const SEARCH_TAKE = 5;

export const SEARCH_KINDS = [
  "customer",
  "employee",
  "vendor",
  "project",
  "transaction",
  "expense",
  "receipt",
  "document",
  "invoice",
  "product",
] as const;

export type SearchKind = (typeof SEARCH_KINDS)[number];

export function searchKindsFor(keys: Iterable<string>, isOwner: boolean): SearchKind[] {
  if (isOwner) return [...SEARCH_KINDS];
  const granted = new Set(keys);
  const has = (...names: string[]) => names.some((name) => granted.has(name));
  const kinds: SearchKind[] = [];
  if (has(PERMISSIONS.MANAGE_CUSTOMERS)) kinds.push("customer");
  if (has(PERMISSIONS.VIEW_WORKFORCE, PERMISSIONS.MANAGE_EMPLOYEES)) kinds.push("employee");
  if (has(PERMISSIONS.VIEW_TEAM_EXPENSES, PERMISSIONS.APPROVE_EXPENSES, PERMISSIONS.MANAGE_EXPENSE_SETTINGS, PERMISSIONS.VIEW_EXPENSE_REPORTS)) {
    kinds.push("vendor");
  }
  if (has(PERMISSIONS.VIEW_DOCUMENTS, PERMISSIONS.CREATE_DOCUMENTS)) kinds.push("project");
  if (has(PERMISSIONS.VIEW_EXPENSE_REPORTS, PERMISSIONS.VIEW_TEAM_EXPENSES, PERMISSIONS.APPROVE_EXPENSES, PERMISSIONS.MANAGE_EXPENSE_SETTINGS, PERMISSIONS.EXPORT_EXPENSES)) {
    kinds.push("transaction");
  }
  if (has(PERMISSIONS.VIEW_OWN_EXPENSES, PERMISSIONS.VIEW_TEAM_EXPENSES, PERMISSIONS.VIEW_EXPENSE_REPORTS, PERMISSIONS.CREATE_EXPENSE)) {
    kinds.push("expense", "receipt");
  }
  if (has(PERMISSIONS.VIEW_DOCUMENTS)) kinds.push("document");
  if (has(PERMISSIONS.PROCESS_SALE, PERMISSIONS.VIEW_REPORTS, PERMISSIONS.PROCESS_REFUND)) kinds.push("invoice");
  if (has(PERMISSIONS.VIEW_PRODUCTS)) kinds.push("product");
  return kinds;
}

export function expenseSearchOwnOnly(keys: Iterable<string>, isOwner: boolean): boolean {
  if (isOwner) return false;
  const granted = new Set(keys);
  return !granted.has(PERMISSIONS.VIEW_TEAM_EXPENSES) && !granted.has(PERMISSIONS.VIEW_EXPENSE_REPORTS) && !granted.has(PERMISSIONS.APPROVE_EXPENSES);
}
