import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { savedFilterSchema } from "@/lib/validations/expenses";
import type { Prisma } from "@prisma/client";

export async function GET() {
  try {
    const ctx = await requireAuth();
    const filters = await db.expenseSavedFilter.findMany({
      where: { businessId: ctx.business.id, employeeId: ctx.employee.id },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(filters);
  } catch (error) {
    return handleApiError(error, "GET /api/expenses/filters");
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const data = savedFilterSchema.parse(await request.json());
    const filtersJson = data.filters as Prisma.InputJsonValue;
    const filter = await db.expenseSavedFilter.upsert({
      where: {
        employeeId_name: { employeeId: ctx.employee.id, name: data.name },
      },
      create: {
        businessId: ctx.business.id,
        employeeId: ctx.employee.id,
        name: data.name,
        filters: filtersJson,
      },
      update: { filters: filtersJson },
    });
    return NextResponse.json(filter, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/expenses/filters");
  }
}
