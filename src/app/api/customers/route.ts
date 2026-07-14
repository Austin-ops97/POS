import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, hasPermission } from "@/lib/auth";
import { customerSchema } from "@/lib/validations";
import { PERMISSIONS } from "@/lib/permissions";
import { createAuditLog } from "@/lib/audit";
import { handleApiError } from "@/lib/api-utils";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim();
    const ctx = await requireAuth();
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const customers = await db.customer.findMany({
      where: {
        businessId: ctx.business.id,
        deletedAt: null,
        ...(search
          ? {
              OR: [
                { firstName: { contains: search, mode: "insensitive" } },
                { lastName: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
                { phone: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: limit,
      skip: offset,
    });

    const total = await db.customer.count({
      where: {
        businessId: ctx.business.id,
        deletedAt: null,
        ...(search
          ? {
              OR: [
                { firstName: { contains: search, mode: "insensitive" } },
                { lastName: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
                { phone: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
    });

    return NextResponse.json({ customers, total, limit, offset });
  } catch (error) {
    return handleApiError(error, "GET /api/customers");
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();

    if (!hasPermission(ctx, PERMISSIONS.MANAGE_CUSTOMERS)) {
      throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_CUSTOMERS}`);
    }

    const body = await request.json();
    const data = customerSchema.parse(body);

    const customer = await db.customer.create({
      data: {
        businessId: ctx.business.id,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email || undefined,
        phone: data.phone,
        address: data.address,
        notes: data.notes,
        tags: data.tags ?? [],
        marketingOptIn: data.marketingOptIn,
      },
    });

    await createAuditLog({
      businessId: ctx.business.id,
      employeeId: ctx.employee.id,
      action: "CREATE",
      entity: "Customer",
      entityId: customer.id,
      details: {
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
      },
    });

    return NextResponse.json(customer, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/customers");
  }
}
