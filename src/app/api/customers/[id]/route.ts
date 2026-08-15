import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, hasPermission } from "@/lib/auth";
import { customerSchema } from "@/lib/validations";
import { PERMISSIONS } from "@/lib/permissions";
import { createAuditLog } from "@/lib/audit";
import { handleApiError } from "@/lib/api-utils";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;

    const customer = await db.customer.findFirst({
      where: {
        id,
        businessId: ctx.business.id,
        deletedAt: null,
      },
      include: {
        orders: {
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            orderNumber: true,
            status: true,
            total: true,
            createdAt: true,
          },
        },
      },
    });

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    return NextResponse.json(customer);
  } catch (error) {
    return handleApiError(error, "GET /api/customers/[id]");
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.MANAGE_CUSTOMERS)) {
      throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_CUSTOMERS}`);
    }

    const { id } = await params;
    const body = await request.json();
    const data = customerSchema.partial().parse(body);

    const existing = await db.customer.findFirst({
      where: {
        id,
        businessId: ctx.business.id,
        deletedAt: null,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const customer = await db.customer.update({
      where: { id },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email || undefined,
        phone: data.phone,
        address: data.address,
        notes: data.notes,
        tags: data.tags,
        marketingOptIn: data.marketingOptIn,
      },
    });

    await createAuditLog({
      businessId: ctx.business.id,
      employeeId: ctx.employee.id,
      action: "UPDATE",
      entity: "Customer",
      entityId: customer.id,
      details: data,
    });

    return NextResponse.json(customer);
  } catch (error) {
    return handleApiError(error, "PATCH /api/customers/[id]");
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.MANAGE_CUSTOMERS)) {
      throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_CUSTOMERS}`);
    }
    const { id } = await params;
    const existing = await db.customer.findFirst({
      where: { id, businessId: ctx.business.id, deletedAt: null },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!existing) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

    const deletedAt = new Date();
    await db.$transaction([
      db.customer.update({ where: { id }, data: { deletedAt } }),
      db.order.updateMany({ where: { businessId: ctx.business.id, customerId: id }, data: { customerId: null } }),
    ]);
    await createAuditLog({
      businessId: ctx.business.id,
      employeeId: ctx.employee.id,
      action: "DELETE",
      entity: "Customer",
      entityId: id,
      details: { deletedAt, historicalOrdersPreserved: true },
    });
    return NextResponse.json({ id, deletedAt, archived: true });
  } catch (error) {
    return handleApiError(error, "DELETE /api/customers/[id]");
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.MANAGE_CUSTOMERS)) {
      throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_CUSTOMERS}`);
    }
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    if (body.action !== "restore") {
      return NextResponse.json({ error: "Only restore is supported" }, { status: 400 });
    }
    const customer = await db.customer.findFirst({ where: { id, businessId: ctx.business.id, deletedAt: { not: null } } });
    if (!customer) return NextResponse.json({ error: "Archived customer not found" }, { status: 404 });
    const restored = await db.customer.update({ where: { id }, data: { deletedAt: null } });
    await createAuditLog({
      businessId: ctx.business.id,
      employeeId: ctx.employee.id,
      action: "UPDATE",
      entity: "Customer",
      entityId: id,
      details: { action: "restore" },
    });
    return NextResponse.json(restored);
  } catch (error) {
    return handleApiError(error, "POST /api/customers/[id]");
  }
}
