import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, hasPermission } from "@/lib/auth";
import { employeeUpdateSchema } from "@/lib/validations/workforce";
import { PERMISSIONS } from "@/lib/permissions";
import { hashPin } from "@/lib/pin";
import { createAuditLog } from "@/lib/audit";
import { handleApiError } from "@/lib/api-utils";
import {
  addCompensationRecord,
  buildEmployeeProfileData,
  sanitizeEmployeeForViewer,
  upsertEmergencyContacts,
} from "@/lib/workforce/employee-service";
import { recordPtoLedgerEntry } from "@/lib/workforce/pto-service";

type RouteParams = { params: Promise<{ id: string }> };

const employeeInclude = {
  role: { select: { id: true, name: true } },
  locations: { include: { location: { select: { id: true, name: true } } } },
  emergencyContacts: { orderBy: { sortOrder: "asc" as const } },
  compensationHistory: { orderBy: { effectiveFrom: "desc" as const }, take: 5 },
  manager: { select: { id: true, name: true } },
  defaultLocation: { select: { id: true, name: true } },
  ptoLedgerEntries: { orderBy: { createdAt: "desc" as const }, take: 10 },
};

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;

    const employee = await db.employeeProfile.findFirst({
      where: {
        id,
        businessId: ctx.business.id,
        deletedAt: null,
      },
      include: employeeInclude,
    });

    if (!employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    const canViewPersonal = hasPermission(ctx, PERMISSIONS.VIEW_EMPLOYEE_PERSONAL);
    const canViewCompensation = hasPermission(ctx, PERMISSIONS.VIEW_COMPENSATION);
    const { pinHash: _pinHash, ...sanitized } = employee;

    return NextResponse.json(
      sanitizeEmployeeForViewer(sanitized, canViewPersonal, canViewCompensation)
    );
  } catch (error) {
    return handleApiError(error, "GET /api/employees/[id]");
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const ctx = await requireAuth();
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

    if (data.employeeNumber && data.employeeNumber !== existing.employeeNumber) {
      const numberTaken = await db.employeeProfile.findFirst({
        where: {
          businessId: ctx.business.id,
          employeeNumber: data.employeeNumber,
          deletedAt: null,
          id: { not: id },
        },
      });
      if (numberTaken) {
        return NextResponse.json({ error: "Employee number already in use" }, { status: 409 });
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

    if (data.managerId) {
      const manager = await db.employeeProfile.findFirst({
        where: { id: data.managerId, businessId: ctx.business.id, deletedAt: null },
      });
      if (!manager) {
        return NextResponse.json({ error: "Manager not found" }, { status: 404 });
      }
    }

    if (data.compensation && !hasPermission(ctx, PERMISSIONS.MANAGE_COMPENSATION)) {
      throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_COMPENSATION}`);
    }

    if (data.ptoAdjustment && !hasPermission(ctx, PERMISSIONS.MANAGE_EMPLOYEES)) {
      return NextResponse.json(
        { error: "PTO adjustments require employee management permission" },
        { status: 403 }
      );
    }

    const pinHash = data.pin ? await hashPin(data.pin) : undefined;
    const profileData = buildEmployeeProfileData(data as Record<string, unknown>);

    const employee = await db.$transaction(async (tx) => {
      await tx.employeeProfile.update({
        where: { id },
        data: {
          ...profileData,
          ...(pinHash ? { pinHash } : {}),
          ...(data.ptoBalanceHours !== undefined && !data.ptoAdjustment
            ? { ptoBalanceHours: data.ptoBalanceHours }
            : {}),
        },
      });

      if (data.locationIds) {
        await tx.employeeLocation.deleteMany({ where: { employeeId: id } });
        if (data.locationIds.length > 0) {
          await tx.employeeLocation.createMany({
            data: data.locationIds.map((locationId) => ({ employeeId: id, locationId })),
          });
        }
      }

      if (data.emergencyContacts) {
        await upsertEmergencyContacts(id, data.emergencyContacts, tx);
      }

      if (data.compensation) {
        await addCompensationRecord({
          employeeId: id,
          createdById: ctx.employee.id,
          compensation: data.compensation,
          tx,
        });
      }

      if (data.ptoAdjustment) {
        await recordPtoLedgerEntry({
          businessId: ctx.business.id,
          employeeId: id,
          type: "ADJUSTMENT",
          hours: data.ptoAdjustment.hours,
          reason: data.ptoAdjustment.reason,
          adjustedById: ctx.employee.id,
          tx,
        });
      }

      return tx.employeeProfile.findUnique({
        where: { id },
        include: employeeInclude,
      });
    });

    const { pinHash: _pinHash, ...sanitized } = employee!;

    await createAuditLog({
      businessId: ctx.business.id,
      employeeId: ctx.employee.id,
      action: "EMPLOYEE_CHANGE",
      entity: "EmployeeProfile",
      entityId: id,
      details: {
        ...data,
        pin: data.pin ? "[redacted]" : undefined,
        ptoAdjustment: data.ptoAdjustment ? "[recorded]" : undefined,
      },
    });

    const canViewPersonal = hasPermission(ctx, PERMISSIONS.VIEW_EMPLOYEE_PERSONAL);
    const canViewCompensation = hasPermission(ctx, PERMISSIONS.VIEW_COMPENSATION);
    return NextResponse.json(
      sanitizeEmployeeForViewer(sanitized, canViewPersonal, canViewCompensation)
    );
  } catch (error) {
    return handleApiError(error, "PATCH /api/employees/[id]");
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const ctx = await requireAuth();
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
