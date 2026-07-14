import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, hasPermission } from "@/lib/auth";
import { locationSchema } from "@/lib/validations";
import { PERMISSIONS } from "@/lib/permissions";
import { createAuditLog } from "@/lib/audit";
import { handleApiError } from "@/lib/api-utils";

export async function GET() {
  try {
    const ctx = await requireAuth();

    const locations = await db.location.findMany({
      where: {
        businessId: ctx.business.id,
        deletedAt: null,
      },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });

    return NextResponse.json(locations);
  } catch (error) {
    return handleApiError(error, "GET /api/locations");
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();

    if (!hasPermission(ctx, PERMISSIONS.MANAGE_LOCATIONS)) {
      throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_LOCATIONS}`);
    }

    const body = await request.json();
    const data = locationSchema.parse(body);

    const locationCount = await db.location.count({
      where: { businessId: ctx.business.id, deletedAt: null },
    });

    const location = await db.location.create({
      data: {
        businessId: ctx.business.id,
        name: data.name,
        street: data.street,
        city: data.city,
        state: data.state,
        zip: data.zip,
        country: data.country,
        timezone: data.timezone,
        taxRegion: data.taxRegion,
        isDefault: locationCount === 0,
      },
    });

    await createAuditLog({
      businessId: ctx.business.id,
      employeeId: ctx.employee.id,
      action: "CREATE",
      entity: "Location",
      entityId: location.id,
      details: { name: location.name },
    });

    return NextResponse.json(location, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/locations");
  }
}
