import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, hasPermission } from "@/lib/auth";
import { employeeSchema } from "@/lib/validations";
import { PERMISSIONS } from "@/lib/permissions";
import { hashPin } from "@/lib/pin";
import { createAuditLog } from "@/lib/audit";
import { handleApiError } from "@/lib/api-utils";

export async function GET() {
  try {
    const ctx = await requireAuth();

    const employees = await db.employeeProfile.findMany({
      where: {
        businessId: ctx.business.id,
        deletedAt: null,
      },
      include: {
        role: { select: { id: true, name: true } },
        locations: {
          include: {
            location: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { name: "asc" },
    });

    const sanitized = employees.map(({ pinHash: _pinHash, ...employee }) => employee);

    return NextResponse.json(sanitized);
  } catch (error) {
    return handleApiError(error, "GET /api/employees");
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();

    if (!hasPermission(ctx, PERMISSIONS.MANAGE_EMPLOYEES)) {
      throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_EMPLOYEES}`);
    }

    const body = await request.json();
    const data = employeeSchema.parse(body);

    const role = await db.role.findUnique({
      where: { id: data.roleId },
    });

    if (!role) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    const existingEmail = await db.employeeProfile.findFirst({
      where: {
        businessId: ctx.business.id,
        email: data.email,
        deletedAt: null,
      },
    });

    if (existingEmail) {
      return NextResponse.json(
        { error: "Employee with this email already exists" },
        { status: 409 }
      );
    }

    if (data.locationIds && data.locationIds.length > 0) {
      const locations = await db.location.findMany({
        where: {
          id: { in: data.locationIds },
          businessId: ctx.business.id,
          deletedAt: null,
        },
      });

      if (locations.length !== data.locationIds.length) {
        return NextResponse.json(
          { error: "One or more locations not found" },
          { status: 404 }
        );
      }
    }

    const pinHash = data.pin ? await hashPin(data.pin) : undefined;

    const employee = await db.$transaction(async (tx) => {
      const created = await tx.employeeProfile.create({
        data: {
          businessId: ctx.business.id,
          roleId: data.roleId,
          name: data.name,
          email: data.email,
          phone: data.phone,
          pinHash,
          status: "INVITED",
        },
        include: {
          role: { select: { id: true, name: true } },
        },
      });

      if (data.locationIds && data.locationIds.length > 0) {
        await tx.employeeLocation.createMany({
          data: data.locationIds.map((locationId) => ({
            employeeId: created.id,
            locationId,
          })),
        });
      }

      return tx.employeeProfile.findUnique({
        where: { id: created.id },
        include: {
          role: { select: { id: true, name: true } },
          locations: {
            include: {
              location: { select: { id: true, name: true } },
            },
          },
        },
      });
    });

    const { pinHash: _pinHash, ...sanitized } = employee!;

    await createAuditLog({
      businessId: ctx.business.id,
      employeeId: ctx.employee.id,
      action: "EMPLOYEE_CHANGE",
      entity: "EmployeeProfile",
      entityId: employee!.id,
      details: {
        name: employee!.name,
        email: employee!.email,
        role: employee!.role.name,
      },
    });

    return NextResponse.json(sanitized, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/employees");
  }
}
