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

const isoDateTime = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: "Invalid ISO datetime",
});

export const shiftSchema = z
  .object({
    employeeId: z.string().min(1, "Employee is required"),
    locationId: z.string().optional(),
    startAt: isoDateTime,
    endAt: isoDateTime,
    notes: z.string().max(500).optional(),
    status: z.enum(["SCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW"]).optional(),
  })
  .superRefine((data, ctx) => {
    const start = new Date(data.startAt);
    const end = new Date(data.endAt);
    if (end <= start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "End time must be after start time",
        path: ["endAt"],
      });
    }
  });

export const timeEntryAdjustSchema = z.object({
  clockIn: isoDateTime.optional(),
  clockOut: isoDateTime.nullable().optional(),
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

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).optional();

export const emergencyContactSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  relationship: z.string().min(1),
  primaryPhone: z.string().min(1),
  alternatePhone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  isPrimary: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const compensationSchema = z.object({
  payType: z.enum(["HOURLY", "SALARY"]),
  hourlyRate: z.number().min(0).nullable().optional(),
  annualSalary: z.number().min(0).nullable().optional(),
  overtimeEligible: z.boolean().optional(),
  overtimeMultiplier: z.number().min(1).max(3).optional(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(500).optional(),
});

export const ptoAdjustmentSchema = z.object({
  hours: z.number().refine((v) => v !== 0, "Adjustment hours cannot be zero"),
  reason: z.string().min(1),
});

export const employeePersonnelSchema = z.object({
  legalFirstName: z.string().min(1).optional(),
  legalMiddleName: z.string().optional(),
  legalLastName: z.string().optional(),
  preferredName: z.string().optional(),
  displayNameStrategy: z.enum(["LEGAL", "PREFERRED", "CUSTOM"]).optional(),
  dateOfBirth: dateOnly.nullable(),
  personalEmail: z.string().email().optional().or(z.literal("")).nullable(),
  workEmail: z.string().email().optional().or(z.literal("")).nullable(),
  mobilePhone: z.string().optional().nullable(),
  secondaryPhone: z.string().optional().nullable(),
  profilePhotoUrl: z.string().url().optional().or(z.literal("")).nullable(),
  addressLine1: z.string().optional().nullable(),
  addressLine2: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  stateProvince: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  employeeNumber: z.string().max(50).optional().nullable(),
  jobTitle: z.string().optional().nullable(),
  department: z.string().optional().nullable(),
  employmentType: z
    .enum(["FULL_TIME", "PART_TIME", "SEASONAL", "TEMPORARY", "CONTRACTOR"])
    .nullable()
    .optional(),
  hireDate: dateOnly.nullable(),
  startDate: dateOnly.nullable(),
  terminationDate: dateOnly.nullable(),
  terminationReason: z.string().optional().nullable(),
  managerId: z.string().optional().nullable(),
  defaultLocationId: z.string().optional().nullable(),
  employmentNotes: z.string().max(2000).optional().nullable(),
  sickBalanceHours: z.number().min(0).optional(),
  ptoCarryoverLimit: z.number().min(0).nullable().optional(),
});

export const employeeUpdateSchema = employeePersonnelSchema.extend({
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
  compensation: compensationSchema.optional(),
  emergencyContacts: z.array(emergencyContactSchema).optional(),
  ptoAdjustment: ptoAdjustmentSchema.optional(),
});

export const employeeCreatePersonnelSchema = employeePersonnelSchema.extend({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  roleId: z.string(),
  pin: z.string().length(4).optional(),
  locationIds: z.array(z.string()).optional(),
  hourlyWage: z.number().min(0).optional(),
  ptoAnnualHours: z.number().min(0).optional(),
  compensation: compensationSchema.optional(),
  emergencyContacts: z.array(emergencyContactSchema).optional(),
});
