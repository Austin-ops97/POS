import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, hasPermission } from "@/lib/auth";
import { ensurePaidSubscription } from "@/lib/subscription-server";
import { timeOffReviewSchema } from "@/lib/validations/workforce";
import { PERMISSIONS } from "@/lib/permissions";
import { createAuditLog } from "@/lib/audit";
import { handleApiError } from "@/lib/api-utils";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const ctx = await requireAuth();
    await ensurePaidSubscription(ctx);

    const { id } = await params;
    const body = await request.json();
    const data = timeOffReviewSchema.parse(body);

    const existing = await db.timeOffRequest.findFirst({
      where: { id, businessId: ctx.business.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const isOwner = existing.employeeId === ctx.employee.id;
    const canApprove = hasPermission(ctx, PERMISSIONS.APPROVE_TIME_OFF);

    if (data.status === "CANCELLED") {
      if (!isOwner && !canApprove) {
        throw new Error("Not authorized to cancel this request");
      }
      if (existing.status !== "PENDING") {
        return NextResponse.json(
          { error: "Only pending requests can be cancelled" },
          { status: 400 }
        );
      }
    } else {
      if (!canApprove) {
        throw new Error(`Missing permission: ${PERMISSIONS.APPROVE_TIME_OFF}`);
      }
      if (existing.status !== "PENDING") {
        return NextResponse.json(
          { error: "Request has already been reviewed" },
          { status: 400 }
        );
      }
      if (data.status === "DENIED" && !data.denialReason) {
        return NextResponse.json(
          { error: "Denial reason is required" },
          { status: 400 }
        );
      }
    }

    const timeOff = await db.$transaction(async (tx) => {
      const updated = await tx.timeOffRequest.update({
        where: { id },
        data: {
          status: data.status,
          reviewedById: data.status === "CANCELLED" && isOwner ? null : ctx.employee.id,
          reviewedAt: data.status === "CANCELLED" && isOwner ? null : new Date(),
          denialReason: data.denialReason,
        },
        include: {
          employee: { select: { id: true, name: true } },
          reviewedBy: { select: { id: true, name: true } },
        },
      });

      if (data.status === "APPROVED" && existing.type === "PTO") {
        await tx.employeeProfile.update({
          where: { id: existing.employeeId },
          data: {
            ptoBalanceHours: {
              decrement: Number(existing.hoursRequested),
            },
          },
        });
      }

      return updated;
    });

    await createAuditLog({
      businessId: ctx.business.id,
      employeeId: ctx.employee.id,
      action: "TIME_OFF_REVIEW",
      entity: "TimeOffRequest",
      entityId: id,
      details: { status: data.status, denialReason: data.denialReason },
    });

    return NextResponse.json(timeOff);
  } catch (error) {
    return handleApiError(error, "PATCH /api/workforce/time-off/[id]");
  }
}
