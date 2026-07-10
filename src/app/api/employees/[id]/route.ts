import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, hasPermission } from "@/lib/auth";
import { ensurePaidSubscription } from "@/lib/subscription-server";
import { employeeUpdateSchema } from "@/lib/validations/workforce";
import { PERMISSIONS } from "@/lib/permissions";
import { hashPin } from "@/lib/pin";
import { createAuditLog } from "@/lib/audit";
import { handleApiError } from "@/lib/api-utils";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const ctx = await requireAuth();
    await ensurePaidSubscription(ctx);
    const { id } = await params;

    const employee = await db.employeeProfile.findFirst({
      where: {
        id,
        businessId: ctx.business.id,
        deletedAt: null,
      },
      include: {
        role: { select: { id: true, name: true } },
        locations: {
          include: { location: { select: { id: true, name: true } } },
        },
      },
    });

    if (!employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    const { pinHash: _pinHash, ...sanitized } = employee;
    return NextResponse.json(sanitized);
  } catch (error) {
    return handleApiError(error, "GET /api/employees/[id]");
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const ctx = await requireAuth();
    await ensurePaidSubscription(ctx);

    if (!hasPermission(ctx, PERMISSIONS.MANAGE_EMPLOYEES)) {
      throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_EMPLOYEES}`);
    }

    const { id } = await params;
    const body = await request.json();
    const data = employeeUpdateSchema.parse(body);

    const existing = await db.employeeProfile.findFirst({
      where: { id, businessId: ctx.business.id, deletedAt: null },
    });

    if (!existing) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    if (data.email && data.email !== existing.email) {
      const emailTaken = await db.employeeProfile.findFirst({
        where: {
          businessId: ctx.business.id,
          email: data.email,
          deletedAt: null,
          id: { not: id },
        },
      });
      if (emailTaken) {
        return NextResponse.json({ error: "Email already in use" }, { status: 409 });
      }
    }

    if (data.locationIds) {
      const locations = await db.location.findMany({
        where: {
          id: { in: data.locationIds },
          businessId: ctx.business.id,
          deletedAt: null,
        },
      });
      if (locations.length !== data.locationIds.length) {
        return NextResponse.json({ error: "Invalid location(s)" }, { status: 404 });
      }
    }

    const pinHash = data.pin ? await hashPin(data.pin) : undefined;

    const employee = await db.$transaction(async (tx) => {
      await tx.employeeProfile.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.email !== undefined ? { email: data.email } : {}),
          ...(data.phone !== undefined ? { phone: data.phone } : {}),
          ...(data.roleId !== undefined ? { roleId: data.roleId } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(pinHash ? { pinHash } : {}),
          ...(data.hourlyWage !== undefined
            ? { hourlyWage: data.hourlyWage }
            : {}),
          ...(data.ptoAnnualHours !== undefined
            ? { ptoAnnualHours: data.ptoAnnualHours }
            : {}),
          ...(data.ptoBalanceHours !== undefined
            ? { ptoBalanceHours: data.ptoBalanceHours }
            : {}),
        },
      });

      if (data.locationIds) {
        await tx.employeeLocation.deleteMany({ where: { employeeId: id } });
        if (data.locationIds.length > 0) {
          await tx.employeeLocation.createMany({
            data: data.locationIds.map((locationId) => ({
              employeeId: id,
              locationId,
            })),
          });
        }
      }

      return tx.employeeProfile.findUnique({
        where: { id },
        include: {
          role: { select: { id: true, name: true } },
          locations: {
            include: { location: { select: { id: true, name: true } } },
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
      entityId: id,
      details: { ...data, pin: data.pin ? "[redacted]" : undefined },
    });

    return NextResponse.json(sanitized);
  } catch (error) {
    return handleApiError(error, "PATCH /api/employees/[id]");
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const ctx = await requireAuth();
    await ensurePaidSubscription(ctx);

    if (!hasPermission(ctx, PERMISSIONS.MANAGE_EMPLOYEES)) {
      throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_EMPLOYEES}`);
    }

    const { id } = await params;

    if (id === ctx.employee.id) {
      return NextResponse.json(
        { error: "Cannot delete your own employee profile" },
        { status: 400 }
      );
    }

    const existing = await db.employeeProfile.findFirst({
      where: { id, businessId: ctx.business.id, deletedAt: null },
    });

    if (!existing) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    await db.employeeProfile.update({
      where: { id },
      data: { deletedAt: new Date(), status: "INACTIVE" },
    });

    await createAuditLog({
      businessId: ctx.business.id,
      employeeId: ctx.employee.id,
      action: "EMPLOYEE_CHANGE",
      entity: "EmployeeProfile",
      entityId: id,
      details: { action: "deleted", name: existing.name },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "DELETE /api/employees/[id]");
  }
}
