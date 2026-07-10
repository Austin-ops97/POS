import type { DisplayNameStrategy, EmployeeProfile, EmploymentType, PayType } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export function buildLegalName(employee: {
  legalFirstName?: string | null;
  legalMiddleName?: string | null;
  legalLastName?: string | null;
}): string {
  return [employee.legalFirstName, employee.legalMiddleName, employee.legalLastName]
    .filter(Boolean)
    .join(" ")
    .trim();
}

export function resolveDisplayName(
  employee: Pick<
    EmployeeProfile,
    "name" | "legalFirstName" | "legalMiddleName" | "legalLastName" | "preferredName" | "displayNameStrategy"
  >
): string {
  const legal = buildLegalName(employee);
  switch (employee.displayNameStrategy) {
    case "PREFERRED":
      return employee.preferredName?.trim() || legal || employee.name;
    case "CUSTOM":
      return employee.name?.trim() || legal;
    case "LEGAL":
    default:
      return legal || employee.name;
  }
}

export function syncLegacyNameFields<T extends {
  name?: string;
  legalFirstName?: string | null;
  legalLastName?: string | null;
  preferredName?: string | null;
  displayNameStrategy?: DisplayNameStrategy | null;
  email?: string;
  workEmail?: string | null;
  phone?: string | null;
  mobilePhone?: string | null;
}>(data: T): T {
  const next = { ...data };
  if (!next.legalFirstName && next.name) {
    const parts = next.name.trim().split(/\s+/);
    next.legalFirstName = parts[0];
    next.legalLastName = parts.length > 1 ? parts.slice(1).join(" ") : next.legalLastName;
  }
  if (!next.workEmail && next.email) {
    next.workEmail = next.email;
  }
  if (!next.mobilePhone && next.phone) {
    next.mobilePhone = next.phone;
  }
  next.name = resolveDisplayName({
    name: next.name ?? "",
    legalFirstName: next.legalFirstName ?? null,
    legalMiddleName: null,
    legalLastName: next.legalLastName ?? null,
    preferredName: next.preferredName ?? null,
    displayNameStrategy: next.displayNameStrategy ?? "LEGAL",
  });
  if (!next.email && next.workEmail) {
    next.email = next.workEmail;
  }
  if (!next.phone && next.mobilePhone) {
    next.phone = next.mobilePhone;
  }
  return next;
}

export type CompensationInput = {
  payType: PayType;
  hourlyRate?: number | null;
  annualSalary?: number | null;
  overtimeEligible?: boolean;
  overtimeMultiplier?: number;
  effectiveFrom: string;
  notes?: string | null;
};

export type EmergencyContactInput = {
  id?: string;
  name: string;
  relationship: string;
  primaryPhone: string;
  alternatePhone?: string | null;
  email?: string | null;
  isPrimary?: boolean;
  sortOrder?: number;
};

export function parseOptionalDate(value?: string | null): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export async function upsertEmergencyContacts(
  employeeId: string,
  contacts: EmergencyContactInput[],
  tx: Prisma.TransactionClient
) {
  await tx.employeeEmergencyContact.deleteMany({ where: { employeeId } });
  if (contacts.length === 0) return;

  const sorted = [...contacts].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  if (!sorted.some((c) => c.isPrimary) && sorted.length > 0) {
    sorted[0].isPrimary = true;
  }

  await tx.employeeEmergencyContact.createMany({
    data: sorted.map((contact, index) => ({
      employeeId,
      name: contact.name,
      relationship: contact.relationship,
      primaryPhone: contact.primaryPhone,
      alternatePhone: contact.alternatePhone ?? null,
      email: contact.email || null,
      isPrimary: contact.isPrimary ?? index === 0,
      sortOrder: contact.sortOrder ?? index,
    })),
  });
}

export async function addCompensationRecord(params: {
  employeeId: string;
  createdById?: string;
  compensation: CompensationInput;
  tx: Prisma.TransactionClient;
}) {
  const { compensation, employeeId, createdById, tx } = params;
  const effectiveFrom = parseOptionalDate(compensation.effectiveFrom)!;

  await tx.employeeCompensation.updateMany({
    where: { employeeId, effectiveTo: null },
    data: {
      effectiveTo: new Date(effectiveFrom.getTime() - 24 * 60 * 60 * 1000),
    },
  });

  const created = await tx.employeeCompensation.create({
    data: {
      employeeId,
      payType: compensation.payType,
      hourlyRate: compensation.hourlyRate ?? null,
      annualSalary: compensation.annualSalary ?? null,
      overtimeEligible: compensation.overtimeEligible ?? true,
      overtimeMultiplier: compensation.overtimeMultiplier ?? 1.5,
      effectiveFrom,
      notes: compensation.notes ?? null,
      createdById,
    },
  });

  if (compensation.payType === "HOURLY" && compensation.hourlyRate != null) {
    await tx.employeeProfile.update({
      where: { id: employeeId },
      data: { hourlyWage: compensation.hourlyRate },
    });
  }

  return created;
}

export function buildEmployeeProfileData(
  data: Record<string, unknown>
): Prisma.EmployeeProfileUpdateInput {
  const synced = syncLegacyNameFields(data as Parameters<typeof syncLegacyNameFields>[0]);
  return {
    ...(synced.name !== undefined ? { name: synced.name } : {}),
    ...(synced.email !== undefined ? { email: synced.email } : {}),
    ...(synced.phone !== undefined ? { phone: synced.phone } : {}),
    ...(data.legalFirstName !== undefined ? { legalFirstName: data.legalFirstName as string } : {}),
    ...(data.legalMiddleName !== undefined
      ? { legalMiddleName: data.legalMiddleName as string }
      : {}),
    ...(data.legalLastName !== undefined ? { legalLastName: data.legalLastName as string } : {}),
    ...(data.preferredName !== undefined ? { preferredName: data.preferredName as string } : {}),
    ...(data.displayNameStrategy !== undefined
      ? { displayNameStrategy: data.displayNameStrategy as DisplayNameStrategy }
      : {}),
    ...(data.dateOfBirth !== undefined
      ? { dateOfBirth: parseOptionalDate(data.dateOfBirth as string) }
      : {}),
    ...(data.personalEmail !== undefined ? { personalEmail: data.personalEmail as string } : {}),
    ...(data.workEmail !== undefined ? { workEmail: data.workEmail as string } : {}),
    ...(data.mobilePhone !== undefined ? { mobilePhone: data.mobilePhone as string } : {}),
    ...(data.secondaryPhone !== undefined
      ? { secondaryPhone: data.secondaryPhone as string }
      : {}),
    ...(data.profilePhotoUrl !== undefined
      ? { profilePhotoUrl: data.profilePhotoUrl as string }
      : {}),
    ...(data.addressLine1 !== undefined ? { addressLine1: data.addressLine1 as string } : {}),
    ...(data.addressLine2 !== undefined ? { addressLine2: data.addressLine2 as string } : {}),
    ...(data.city !== undefined ? { city: data.city as string } : {}),
    ...(data.stateProvince !== undefined ? { stateProvince: data.stateProvince as string } : {}),
    ...(data.postalCode !== undefined ? { postalCode: data.postalCode as string } : {}),
    ...(data.country !== undefined ? { country: data.country as string } : {}),
    ...(data.employeeNumber !== undefined
      ? { employeeNumber: data.employeeNumber as string }
      : {}),
    ...(data.jobTitle !== undefined ? { jobTitle: data.jobTitle as string } : {}),
    ...(data.department !== undefined ? { department: data.department as string } : {}),
    ...(data.employmentType !== undefined
      ? { employmentType: data.employmentType as EmploymentType }
      : {}),
    ...(data.hireDate !== undefined ? { hireDate: parseOptionalDate(data.hireDate as string) } : {}),
    ...(data.startDate !== undefined
      ? { startDate: parseOptionalDate(data.startDate as string) }
      : {}),
    ...(data.terminationDate !== undefined
      ? { terminationDate: parseOptionalDate(data.terminationDate as string) }
      : {}),
    ...(data.terminationReason !== undefined
      ? { terminationReason: data.terminationReason as string }
      : {}),
    ...(data.managerId !== undefined ? { managerId: data.managerId as string } : {}),
    ...(data.defaultLocationId !== undefined
      ? { defaultLocationId: data.defaultLocationId as string }
      : {}),
    ...(data.employmentNotes !== undefined
      ? { employmentNotes: data.employmentNotes as string }
      : {}),
    ...(data.sickBalanceHours !== undefined
      ? { sickBalanceHours: data.sickBalanceHours as number }
      : {}),
    ...(data.ptoCarryoverLimit !== undefined
      ? { ptoCarryoverLimit: data.ptoCarryoverLimit as number }
      : {}),
    ...(data.ptoAnnualHours !== undefined ? { ptoAnnualHours: data.ptoAnnualHours as number } : {}),
    ...(data.roleId !== undefined ? { roleId: data.roleId as string } : {}),
    ...(data.status !== undefined ? { status: data.status as never } : {}),
    ...(data.hourlyWage !== undefined ? { hourlyWage: data.hourlyWage as number } : {}),
  };
}

export async function getEffectiveCompensation(employeeId: string, asOf = new Date()) {
  return db.employeeCompensation.findFirst({
    where: {
      employeeId,
      effectiveFrom: { lte: asOf },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });
}

export function sanitizeEmployeeForViewer<T extends Record<string, unknown>>(
  employee: T,
  canViewPersonal: boolean,
  canViewCompensation: boolean
): T {
  const copy = { ...employee };
  if (!canViewPersonal) {
    delete copy.dateOfBirth;
    delete copy.personalEmail;
    delete copy.addressLine1;
    delete copy.addressLine2;
    delete copy.city;
    delete copy.stateProvince;
    delete copy.postalCode;
    delete copy.emergencyContacts;
  }
  if (!canViewCompensation) {
    delete copy.hourlyWage;
    delete copy.compensationHistory;
    delete copy.compensation;
  }
  return copy;
}
