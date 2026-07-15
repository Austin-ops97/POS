import { db } from "@/lib/db";
import { DEFAULT_EXPENSE_CATEGORIES, slugifyCategory } from "./constants";

export async function ensureDefaultExpenseCategories(businessId: string) {
  const existing = await db.expenseCategory.count({
    where: { businessId, deletedAt: null },
  });
  if (existing > 0) {
    return db.expenseCategory.findMany({
      where: { businessId, deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
  }

  await db.expenseCategory.createMany({
    data: DEFAULT_EXPENSE_CATEGORIES.map((name, index) => ({
      businessId,
      name,
      slug: slugifyCategory(name),
      isSystem: true,
      sortOrder: index,
    })),
    skipDuplicates: true,
  });

  return db.expenseCategory.findMany({
    where: { businessId, deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function findCategoryByName(businessId: string, name: string) {
  const slug = slugifyCategory(name);
  return db.expenseCategory.findFirst({
    where: {
      businessId,
      deletedAt: null,
      OR: [
        { slug },
        { name: { equals: name, mode: "insensitive" } },
      ],
    },
  });
}
