import { db } from "@/lib/db";
import { getEffectiveCompensation } from "./employee-service";
import { ensureWorkforceSettings } from "./settings";
import { loadAvailabilityMap } from "./availability-service";
import { suggestSchedule, type SuggestionSlot } from "./schedule-suggestions";
import { buildShiftInstants } from "./timezone";
import { getWeekStart } from "./pay-period";

export async function buildScheduleSuggestion(params: {
  businessId: string;
  locationId?: string | null;
  slots: Array<{
    date: string;
    startTime: string;
    endTime: string;
    headcount: number;
    requiredRole?: string | null;
    projectTitle?: string | null;
  }>;
}) {
  const settings = await ensureWorkforceSettings(params.businessId);
  const location = params.locationId
    ? await db.location.findFirst({
        where: { id: params.locationId, businessId: params.businessId, deletedAt: null, isActive: true },
        select: { id: true, timezone: true },
      })
    : null;
  if (params.locationId && !location) throw new Error("Location not found");
  const timeZone = location?.timezone ?? "UTC";
  const slots: SuggestionSlot[] = params.slots.map((slot, index) => {
    const instants = buildShiftInstants({
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      timezone: timeZone,
    });
    return {
      id: `slot-${index + 1}`,
      startAt: instants.startAt,
      endAt: instants.endAt,
      locationId: location?.id ?? null,
      requiredRole: slot.requiredRole,
      projectTitle: slot.projectTitle,
      headcount: slot.headcount,
    };
  });
  const rangeStart = new Date(Math.min(...slots.map((slot) => slot.startAt.getTime())));
  const rangeEnd = new Date(Math.max(...slots.map((slot) => slot.endAt.getTime())));
  const weekStart = getWeekStart(rangeStart, settings.weekStartDay);
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  const employees = await db.employeeProfile.findMany({
    where: { businessId: params.businessId, deletedAt: null, status: "ACTIVE" },
    include: { role: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
  const employeeIds = employees.map((employee) => employee.id);
  const [availability, shifts, projects] = await Promise.all([
    loadAvailabilityMap(params.businessId, employeeIds, weekStart, rangeEnd),
    db.shift.findMany({
      where: {
        businessId: params.businessId,
        employeeId: { in: employeeIds },
        status: { not: "CANCELLED" },
        startAt: { lt: weekEnd },
        endAt: { gt: weekStart },
      },
    }),
    db.officeWorkspaceRecord.findMany({
      where: {
        businessId: params.businessId,
        workspace: "projects",
        archivedAt: null,
        assignedToId: { in: employeeIds },
      },
      select: { title: true, assignedToId: true },
    }),
  ]);

  const suggestionEmployees = [];
  for (const employee of employees) {
    const compensation = await getEffectiveCompensation(employee.id, rangeEnd);
    const salaried = compensation?.payType === "SALARY";
    const hourlyRate = salaried ? 0 : Number(compensation?.hourlyRate ?? employee.hourlyWage ?? 0);
    const ownShifts = shifts.filter((shift) => shift.employeeId === employee.id);
    const weekHours = ownShifts.reduce((sum, shift) => sum + (shift.endAt.getTime() - shift.startAt.getTime()) / 3_600_000, 0);
    const record = availability.get(employee.id);
    suggestionEmployees.push({
      id: employee.id,
      name: employee.name,
      roleName: employee.role.name,
      jobTitle: employee.jobTitle,
      hourlyRate,
      salaried,
      exempt: compensation ? !compensation.overtimeEligible : false,
      maxWeeklyHours: employee.maxWeeklyHours != null ? Number(employee.maxWeeklyHours) : null,
      preferredWeeklyHours: employee.preferredWeeklyHours != null ? Number(employee.preferredWeeklyHours) : null,
      weeklyThresholdHours: Number(settings.overtimeThresholdHours),
      overtimeMultiplier: Number(compensation?.overtimeMultiplier ?? settings.overtimeMultiplier),
      windows: record?.windows ?? [],
      exceptions: record?.exceptions ?? [],
      timeOff: record?.timeOff ?? [],
      existingShifts: ownShifts.map((shift) => ({ startAt: shift.startAt, endAt: shift.endAt })),
      projectTitles: projects.filter((project) => project.assignedToId === employee.id).map((project) => project.title),
      weekHours,
    });
  }

  const suggestion = suggestSchedule({
    slots,
    employees: suggestionEmployees,
    timeZone,
    laborCostAlertAmount: settings.laborCostAlertAmount != null ? Number(settings.laborCostAlertAmount) : null,
  });
  return {
    ...suggestion,
    timeZone,
    rules: {
      weeklyThresholdHours: Number(settings.overtimeThresholdHours),
      overtimeMultiplier: Number(settings.overtimeMultiplier),
      dailyOvertimeThresholdHours: settings.dailyOvertimeThresholdHours != null ? Number(settings.dailyOvertimeThresholdHours) : null,
      laborCostAlertAmount: settings.laborCostAlertAmount != null ? Number(settings.laborCostAlertAmount) : null,
    },
  };
}
