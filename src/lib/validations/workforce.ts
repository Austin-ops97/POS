import { z } from "zod";

export const workforceSettingsSchema = z.object({
  payPeriodType: z.enum(["WEEKLY", "BIWEEKLY", "SEMIMONTHLY", "MONTHLY"]),
  weekStartDay: z.number().int().min(0).max(6),
  overtimeThresholdHours: z.number().min(0).max(168),
  defaultPtoAnnualHours: z.number().min(0).max(1000),
});

export const timeClockActionSchema = z.object({
  pin: z.string().length(4),
  action: z.enum(["LOOKUP", "CLOCK_IN", "CLOCK_OUT", "START_BREAK", "END_BREAK"]),
  locationId: z.string().optional(),
});

export const shiftSchema = z.object({
  employeeId: z.string().min(1),
  locationId: z.string().optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  notes: z.string().optional(),
  status: z.enum(["SCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW"]).optional(),
});

export const timeEntryAdjustSchema = z.object({
  clockIn: z.string().datetime().optional(),
  clockOut: z.string().datetime().nullable().optional(),
  adjustmentNote: z.string().min(1),
});

export const timeOffRequestSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(["PTO", "SICK", "UNPAID", "OTHER"]),
  notes: z.string().optional(),
  hoursRequested: z.number().min(0.5).max(1000).optional(),
});

export const timeOffReviewSchema = z.object({
  status: z.enum(["APPROVED", "DENIED", "CANCELLED"]),
  denialReason: z.string().optional(),
});

export const payrollBonusSchema = z.object({
  employeeId: z.string().min(1),
  amount: z.number().min(0.01),
  description: z.string().min(1),
  payPeriodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  payPeriodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const employeeUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  roleId: z.string().optional(),
  pin: z.string().length(4).optional(),
  locationIds: z.array(z.string()).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "INVITED"]).optional(),
  hourlyWage: z.number().min(0).nullable().optional(),
  ptoAnnualHours: z.number().min(0).optional(),
  ptoBalanceHours: z.number().min(0).optional(),
});
