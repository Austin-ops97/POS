import { NextResponse } from "next/server";
import { requireAuth, hasPermission } from "@/lib/auth";
import { shiftSchema } from "@/lib/validations/workforce";
import { PERMISSIONS } from "@/lib/permissions";
import { cancelShift, updateShift } from "@/lib/workforce/schedule-service";
import { handleApiError } from "@/lib/api-utils";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.MANAGE_WORKFORCE)) {
      throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_WORKFORCE}`);
    }

    const { id } = await params;
    const body = await request.json();
    const data = shiftSchema.partial().parse(body);

    const result = await updateShift({
      businessId: ctx.business.id,
      shiftId: id,
      actorId: ctx.employee.id,
      data: {
        ...(data.employeeId ? { employeeId: data.employeeId } : {}),
        ...(data.locationId !== undefined ? { locationId: data.locationId } : {}),
        ...(data.startAt ? { startAt: new Date(data.startAt) } : {}),
        ...(data.endAt ? { endAt: new Date(data.endAt) } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.status ? { status: data.status } : {}),
      },
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error, code: "SHIFT_UPDATE_FAILED" }, { status: result.status });
    }

    return NextResponse.json(result.shift);
  } catch (error) {
    return handleApiError(error, "PATCH /api/workforce/shifts/[id]");
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.MANAGE_WORKFORCE)) {
      throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_WORKFORCE}`);
    }

    const { id } = await params;
    const result = await cancelShift({
      businessId: ctx.business.id,
      shiftId: id,
      actorId: ctx.employee.id,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error, code: "SHIFT_CANCEL_FAILED" }, { status: result.status });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "DELETE /api/workforce/shifts/[id]");
  }
}
