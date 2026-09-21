export function dayStart(iso: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error("Invalid range: use YYYY-MM-DD");
  return new Date(`${iso}T00:00:00.000Z`);
}

export function dayEnd(iso: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error("Invalid range: use YYYY-MM-DD");
  return new Date(`${iso}T23:59:59.999Z`);
}

export function bankTransactionWhere(
  businessId: string,
  filters: { accountId?: string | null; categoryId?: string | null; personal?: boolean | null } = {},
) {
  return {
    businessId,
    ...(filters.accountId ? { accountId: filters.accountId } : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.personal == null ? {} : { personal: filters.personal }),
  };
}
