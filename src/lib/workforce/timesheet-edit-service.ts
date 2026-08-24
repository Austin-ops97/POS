import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { validateTimesheetEditTimes } from "./timesheet-flags";

export type TimesheetEditProposal = {
  clockIn: Date;
  clockOut: Date | null;
  reason: string;
};

export { validateTimesheetEditTimes };

export async function createTimesheetEditRequest(params: {
  businessId: string;
  employeeId: string;
  timeEntryId: string;
  proposal: TimesheetEditProposal;
}) {
  const entry = await db.timeEntry.findFirst({
    where: {
      id: params.timeEntryId,
      businessId: params.businessId,
      employeeId: params.employeeId,
    },
    include: {
      editRequests: {
        where: { status: "PENDING" },
        select: { id: true },
      },
    },
  });

  if (!entry) {
    throw new Error("Time entry not found");
  }

  if (entry.status === "ACTIVE") {
    throw new Error("Clock out before requesting an edit to an open shift");
  }

  if (entry.editRequests.length > 0) {
    throw new Error("This entry already has a pending edit request");
  }

  const timingError = validateTimesheetEditTimes(
    params.proposal.clockIn,
    params.proposal.clockOut
  );
  if (timingError) {
    throw new Error(timingError);
  }

  const sameIn = entry.clockIn.getTime() === params.proposal.clockIn.getTime();
  const sameOut =
    (entry.clockOut?.getTime() ?? null) ===
    (params.proposal.clockOut?.getTime() ?? null);
  if (sameIn && sameOut) {
    throw new Error("Proposed times must differ from the current entry");
  }

  return db.timeEntryEditRequest.create({
    data: {
      businessId: params.businessId,
      timeEntryId: entry.id,
      employeeId: params.employeeId,
      originalClockIn: entry.clockIn,
      originalClockOut: entry.clockOut,
      proposedClockIn: params.proposal.clockIn,
      proposedClockOut: params.proposal.clockOut,
      reason: params.proposal.reason,
      status: "PENDING",
    },
    include: {
      employee: { select: { id: true, name: true } },
      timeEntry: {
        select: {
          id: true,
          clockIn: true,
          clockOut: true,
          status: true,
        },
      },
    },
  });
}

export async function reviewTimesheetEditRequest(params: {
  businessId: string;
  requestId: string;
  reviewerId: string;
  status: "APPROVED" | "DENIED" | "CANCELLED";
  denialReason?: string;
  isOwner: boolean;
}) {
  const existing = await db.timeEntryEditRequest.findFirst({
    where: { id: params.requestId, businessId: params.businessId },
    include: { timeEntry: true },
  });

  if (!existing) {
    throw new Error("Edit request not found");
  }

  if (existing.status !== "PENDING") {
    throw new Error("Request has already been reviewed");
  }

  if (params.status === "CANCELLED") {
    if (!params.isOwner) {
      throw new Error("Only the requester can cancel this edit");
    }
    return db.timeEntryEditRequest.update({
      where: { id: existing.id },
      data: { status: "CANCELLED" },
      include: {
        employee: { select: { id: true, name: true } },
        reviewedBy: { select: { id: true, name: true } },
        timeEntry: {
          select: { id: true, clockIn: true, clockOut: true, status: true },
        },
      },
    });
  }

  if (params.status === "DENIED" && !params.denialReason?.trim()) {
    throw new Error("Denial reason is required");
  }

  return db.$transaction(async (tx) => {
    if (params.status === "APPROVED") {
      const timingError = validateTimesheetEditTimes(
        existing.proposedClockIn,
        existing.proposedClockOut
      );
      if (timingError) {
        throw new Error(timingError);
      }

      await tx.timeEntry.update({
        where: { id: existing.timeEntryId },
        data: {
          clockIn: existing.proposedClockIn,
          clockOut: existing.proposedClockOut,
          status: existing.proposedClockOut ? "ADJUSTED" : existing.timeEntry.status,
          adjustedById: params.reviewerId,
          adjustmentNote: existing.reason,
        },
      });
    }

    return tx.timeEntryEditRequest.update({
      where: { id: existing.id },
      data: {
        status: params.status,
        reviewedById: params.reviewerId,
        reviewedAt: new Date(),
        denialReason: params.denialReason,
      },
      include: {
        employee: { select: { id: true, name: true } },
        reviewedBy: { select: { id: true, name: true } },
        timeEntry: {
          select: { id: true, clockIn: true, clockOut: true, status: true },
        },
      },
    });
  });
}

export type TimeEntryEditListInclude = Prisma.TimeEntryEditRequestGetPayload<{
  include: {
    employee: { select: { id: true; name: true; managerId: true } };
    reviewedBy: { select: { id: true; name: true } };
    timeEntry: {
      select: { id: true; clockIn: true; clockOut: true; status: true };
    };
  };
}>;
