import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, hasPermission, requireAnyPermission } from "@/lib/auth";
import { employeeSchema } from "@/lib/validations";
import { PERMISSIONS } from "@/lib/permissions";
import { hashPin } from "@/lib/pin";
import { createAuditLog } from "@/lib/audit";
import { handleApiError } from "@/lib/api-utils";
import { assertRoleAssignmentAllowed } from "@/lib/employee-security";
import { createInvitationToken, INVITATION_TTL_MS } from "@/lib/employee-invitations";
import { requireModule } from "@/lib/access-control";
import { getCurrentPayPeriod } from "@/lib/workforce/pay-period";
import { openingPtoGrant } from "@/lib/workforce/pto-accrual";
import { recordPtoLedgerEntry } from "@/lib/workforce/pto-service";

export async function GET() {
  try {
    const ctx = await requireAuth();
    await requireModule(ctx, "WORKFORCE");
    await requireAnyPermission(ctx, [
      PERMISSIONS.MANAGE_EMPLOYEES,
      PERMISSIONS.VIEW_WORKFORCE,
      PERMISSIONS.MANAGE_WORKFORCE,
    ]);

    const canViewCompensation = hasPermission(ctx, PERMISSIONS.VIEW_COMPENSATION);

    const employees = await db.employeeProfile.findMany({
      where: {
        businessId: ctx.business.id,
        deletedAt: null,
        archivedAt: null,
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

    const sanitized = employees.map(({ pinHash: _pinHash, hourlyWage, ...employee }) => {
      void _pinHash;
      return { ...employee, ...(canViewCompensation ? { hourlyWage } : {}) };
    });

    return NextResponse.json(sanitized);
  } catch (error) {
    return handleApiError(error, "GET /api/employees");
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    await requireModule(ctx, "WORKFORCE");

    if (!hasPermission(ctx, PERMISSIONS.MANAGE_EMPLOYEES)) {
      throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_EMPLOYEES}`);
    }

    const body = await request.json();
    const data = employeeSchema.parse(body);

    await assertRoleAssignmentAllowed(ctx, data.roleId);

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
    const invitation = createInvitationToken();

    const workforceSettings = await db.workforceSettings.findUnique({
      where: { businessId: ctx.business.id },
    });
    const defaultPto = workforceSettings
      ? Number(workforceSettings.defaultPtoAnnualHours)
      : 80;
    const policy = data.ptoAccrualPolicy ?? workforceSettings?.defaultPtoAccrualPolicy ?? "ANNUAL_GRANT";
    const annualHours = data.ptoAnnualHours ?? defaultPto;
    const payPeriodType = workforceSettings?.payPeriodType ?? "BIWEEKLY";
    const weekStartDay = workforceSettings?.weekStartDay ?? 0;
    const now = new Date();
    const payPeriod = getCurrentPayPeriod(payPeriodType, weekStartDay, now);
    const opening = openingPtoGrant({
      policy,
      annualHours,
      payPeriodType,
      now,
      payPeriodStart: payPeriod.start,
    });

    const employee = await db.$transaction(async (tx) => {
      const created = await tx.employeeProfile.create({
        data: {
          businessId: ctx.business.id,
          roleId: data.roleId,
          name: data.name,
          email: data.email,
          phone: data.phone,
          pinHash,
          hourlyWage: data.hourlyWage,
          ptoAnnualHours: annualHours,
          ptoAccrualPolicy: policy,
          ptoBalanceHours: 0,
          status: "INVITED",
          inviteTokenHash: invitation.hash,
          inviteExpiresAt: new Date(Date.now() + INVITATION_TTL_MS),
          invitedAt: new Date(),
        },
        include: {
          role: { select: { id: true, name: true } },
        },
      });

      if (opening.hours > 0 && opening.periodKey) {
        await recordPtoLedgerEntry({
          businessId: ctx.business.id,
          employeeId: created.id,
          type: "ACCRUAL",
          hours: opening.hours,
          reason: "Opening PTO grant",
          referenceId: opening.periodKey,
          adjustedById: ctx.employee.id,
          tx,
        });
      }

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
    void _pinHash;

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

    const baseUrl = new URL(request.url).origin;
    return NextResponse.json(
      { ...sanitized, invitationUrl: `${baseUrl}/join/${invitation.token}` },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error, "POST /api/employees");
  }
}
