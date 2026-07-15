import { NextResponse } from "next/server";
import { requireAuth, hasPermission } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import { expenseVendorSchema } from "@/lib/validations/expenses";
import { normalizeVendorName } from "@/lib/expenses/constants";

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.VIEW_OWN_EXPENSES)) {
      throw new Error(`Missing permission: ${PERMISSIONS.VIEW_OWN_EXPENSES}`);
    }
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") ?? undefined;
    const vendors = await db.expenseVendor.findMany({
      where: {
        businessId: ctx.business.id,
        deletedAt: null,
        ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      },
      include: { category: { select: { id: true, name: true } } },
      orderBy: [{ isFavorite: "desc" }, { totalSpend: "desc" }],
      take: 50,
    });
    return NextResponse.json(vendors);
  } catch (error) {
    return handleApiError(error, "GET /api/expenses/vendors");
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.CREATE_EXPENSE)) {
      throw new Error(`Missing permission: ${PERMISSIONS.CREATE_EXPENSE}`);
    }
    const data = expenseVendorSchema.parse(await request.json());
    const vendor = await db.expenseVendor.upsert({
      where: {
        businessId_normalizedName: {
          businessId: ctx.business.id,
          normalizedName: normalizeVendorName(data.name),
        },
      },
      create: {
        businessId: ctx.business.id,
        name: data.name,
        normalizedName: normalizeVendorName(data.name),
        categoryId: data.categoryId ?? null,
        address: data.address,
        phone: data.phone,
        website: data.website || null,
        notes: data.notes,
        isFavorite: data.isFavorite ?? false,
      },
      update: {
        deletedAt: null,
        name: data.name,
        categoryId: data.categoryId ?? undefined,
        address: data.address,
        phone: data.phone,
        website: data.website || null,
        notes: data.notes,
        isFavorite: data.isFavorite,
      },
    });
    return NextResponse.json(vendor, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/expenses/vendors");
  }
}
