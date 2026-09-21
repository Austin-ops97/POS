import { z } from "zod";

export const workforceSettingsSchema = z
  .object({
    payPeriodType: z.enum(["WEEKLY", "BIWEEKLY", "SEMIMONTHLY", "MONTHLY"]),
    weekStartDay: z.number().int().min(0).max(6),
    overtimeThresholdHours: z.number().min(0).max(168),
    overtimeMultiplier: z.number().min(1).max(3),
    dailyOvertimeThresholdHours: z.number().min(0).max(24).nullable(),
    doubleTimeDailyThresholdHours: z.number().min(0).max(24).nullable(),
    doubleTimeMultiplier: z.number().min(1).max(3),
    laborCostAlertAmount: z.number().min(0).nullable(),
    defaultPtoAnnualHours: z.number().min(0).max(1000),
    defaultPtoAccrualPolicy: z.enum(["ANNUAL_GRANT", "PER_PAY_PERIOD", "MONTHLY", "NONE"]),
    paidBreaks: z.boolean(),
    employerReference: z.string().trim().max(40),
  })
  .superRefine((data, ctx) => {
    if (
      data.dailyOvertimeThresholdHours != null &&
      data.doubleTimeDailyThresholdHours != null &&
      data.doubleTimeDailyThresholdHours <= data.dailyOvertimeThresholdHours
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Double time must start after daily overtime",
        path: ["doubleTimeDailyThresholdHours"],
      });
    }
  });

const minuteOfDay = z.number().int().min(0).max(24 * 60);

export const availabilitySaveSchema = z.object({
  employeeId: z.string().min(1),
  maxWeeklyHours: z.number().min(0).max(168).nullable(),
  preferredWeeklyHours: z.number().min(0).max(168).nullable(),
  windows: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        startMinute: minuteOfDay,
        endMinute: minuteOfDay,
      })
    )
    .max(14),
});

export const availabilityExceptionSchema = z.object({
  employeeId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  available: z.boolean(),
  startMinute: minuteOfDay.nullable(),
  endMinute: minuteOfDay.nullable(),
  note: z.string().max(300).optional().nullable(),
});

export const scheduleSuggestSchema = z.object({
  locationId: z.string().min(1).nullable().optional(),
  slots: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        startTime: z.string().regex(/^\d{2}:\d{2}$/),
        endTime: z.string().regex(/^\d{2}:\d{2}$/),
        headcount: z.number().int().min(1).max(20),
        requiredRole: z.string().max(80).optional().nullable(),
        projectTitle: z.string().max(180).optional().nullable(),
      })
    )
    .min(1)
    .max(40),
});

export const schedulePublishSchema = z.object({
  assignments: z
    .array(
      z.object({
        employeeId: z.string().min(1),
        locationId: z.string().nullable().optional(),
        startAt: z.string().min(1),
        endAt: z.string().min(1),
      })
    )
    .min(1)
    .max(80),
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

export const timeEntryEditRequestSchema = z
  .object({
    timeEntryId: z.string().min(1),
    clockIn: isoDateTime,
    clockOut: isoDateTime.nullable(),
    reason: z.string().min(1).max(1000),
  })
  .superRefine((data, ctx) => {
    if (data.clockOut) {
      const start = new Date(data.clockIn);
      const end = new Date(data.clockOut);
      if (end <= start) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Clock out must be after clock in",
          path: ["clockOut"],
        });
      }
    }
  });

export const timeEntryEditReviewSchema = z.object({
  status: z.enum(["APPROVED", "DENIED", "CANCELLED"]),
  denialReason: z.string().optional(),
});

export const timeOffRequestSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(["PTO", "SICK", "VACATION", "HOLIDAY", "UNPAID", "OTHER"]),
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
  ptoAccrualPolicy: z.enum(["ANNUAL_GRANT", "PER_PAY_PERIOD", "MONTHLY", "NONE"]).optional(),
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

const payrollDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const payrollRateRule = z
  .object({
    code: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(/^[A-Za-z0-9_-]+$/)
      .transform((value) => value.toUpperCase()),
    name: z.string().trim().min(1).max(80),
    basis: z.enum(["PERCENT_OF_GROSS", "PERCENT_OF_TAXABLE", "FLAT"]),
    rate: z.number().min(0),
    effectiveFrom: payrollDate,
    effectiveTo: payrollDate.nullable().optional(),
    sortOrder: z.number().int().min(0).max(1000).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.basis !== "FLAT" && data.rate > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Percent rates are decimals from 0 to 1 (0.062 is 6.2%)",
        path: ["rate"],
      });
    }
    if (data.effectiveTo && data.effectiveTo < data.effectiveFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Effective end must be on or after the start date",
        path: ["effectiveTo"],
      });
    }
  });

export const payrollTaxConfigSchema = payrollRateRule.and(
  z.object({
    side: z.enum(["EMPLOYEE", "EMPLOYER"]),
    wageBase: z.number().min(0).nullable().optional(),
  })
);

export const payrollDeductionConfigSchema = payrollRateRule.and(
  z.object({
    timing: z.enum(["PRE_TAX", "POST_TAX"]),
  })
);

export const payrollConfigEndSchema = z.object({
  effectiveTo: payrollDate,
});

export const payrollProcessSchema = z
  .object({
    periodStart: payrollDate,
    periodEnd: payrollDate,
    payDate: payrollDate,
    adjustments: z
      .array(
        z.object({
          employeeId: z.string().min(1),
          commission: z.number().min(0).default(0),
          other: z.number().min(0).default(0),
        })
      )
      .max(500)
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.periodEnd < data.periodStart) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Period end must be on or after the start date",
        path: ["periodEnd"],
      });
    }
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
