import { db } from "@/lib/db";

export async function hasOverlappingShift(
  employeeId: string,
  startAt: Date,
  endAt: Date,
  excludeShiftId?: string
): Promise<boolean> {
  const overlapping = await db.shift.findFirst({
    where: {
      employeeId,
      status: { not: "CANCELLED" },
      ...(excludeShiftId ? { id: { not: excludeShiftId } } : {}),
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
  });
  return !!overlapping;
}

export function validateShiftTimes(startAt: Date, endAt: Date): string | null {
  if (endAt <= startAt) {
    return "End time must be after start time";
  }
  const durationHours = (endAt.getTime() - startAt.getTime()) / (1000 * 60 * 60);
  if (durationHours > 24) {
    return "Shift cannot exceed 24 hours";
  }
  return null;
}
