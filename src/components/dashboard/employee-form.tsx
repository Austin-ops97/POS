"use client";

import { useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { z } from "zod";
import { employeeSchema } from "@/lib/validations";
import { employeeUpdateSchema } from "@/lib/validations/workforce";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const employeeFormSchema = employeeUpdateSchema.extend({
  pin: z.union([z.string().length(4), z.literal("")]).optional(),
  hourlyWage: z.coerce.number().min(0).optional(),
  ptoAnnualHours: z.coerce.number().min(0).optional(),
  ptoBalanceHours: z.coerce.number().min(0).optional(),
  sickBalanceHours: z.coerce.number().min(0).optional(),
  compensationHourlyRate: z.coerce.number().min(0).optional(),
  compensationAnnualSalary: z.coerce.number().min(0).optional(),
  compensationEffectiveFrom: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactRelationship: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
});

type EmployeeFormValues = z.infer<typeof employeeFormSchema>;

type EmployeeFormProps = {
  roles: Array<{ id: string; name: string }>;
  locations: Array<{ id: string; name: string }>;
  managers?: Array<{ id: string; name: string }>;
  employeeId?: string;
  canViewCompensation?: boolean;
  canManageCompensation?: boolean;
  canViewPersonal?: boolean;
  defaultValues?: Partial<EmployeeFormValues & { locationIds: string[] }>;
};

export function EmployeeForm({
  roles,
  locations,
  managers = [],
  employeeId,
  canViewCompensation = true,
  canManageCompensation = false,
  canViewPersonal = true,
  defaultValues,
}: EmployeeFormProps) {
  const router = useRouter();
  const isEdit = !!employeeId;
  const [dirty, setDirty] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const createSchema = isEdit ? employeeFormSchema : employeeSchema.merge(employeeFormSchema);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<EmployeeFormValues>({
    resolver: zodResolver(createSchema) as Resolver<EmployeeFormValues>,
    defaultValues: {
      name: defaultValues?.name ?? "",
      legalFirstName: defaultValues?.legalFirstName ?? defaultValues?.name?.split(" ")[0] ?? "",
      legalLastName:
        defaultValues?.legalLastName ??
        defaultValues?.name?.split(" ").slice(1).join(" ") ??
        "",
      preferredName: defaultValues?.preferredName ?? "",
      email: defaultValues?.email ?? "",
      workEmail: defaultValues?.workEmail ?? defaultValues?.email ?? "",
      phone: defaultValues?.phone ?? "",
      mobilePhone: defaultValues?.mobilePhone ?? defaultValues?.phone ?? "",
      roleId: defaultValues?.roleId ?? "",
      pin: "",
      locationIds: defaultValues?.locationIds ?? [],
      hourlyWage: defaultValues?.hourlyWage ?? undefined,
      ptoAnnualHours: defaultValues?.ptoAnnualHours ?? undefined,
      jobTitle: defaultValues?.jobTitle ?? "",
      department: defaultValues?.department ?? "",
      employeeNumber: defaultValues?.employeeNumber ?? "",
      employmentType: defaultValues?.employmentType ?? undefined,
      managerId: defaultValues?.managerId ?? "",
      defaultLocationId: defaultValues?.defaultLocationId ?? "",
      addressLine1: defaultValues?.addressLine1 ?? "",
      city: defaultValues?.city ?? "",
      stateProvince: defaultValues?.stateProvince ?? "",
      postalCode: defaultValues?.postalCode ?? "",
      country: defaultValues?.country ?? "US",
      ...(isEdit ? { ptoBalanceHours: defaultValues?.ptoBalanceHours ?? undefined } : {}),
      ...(isEdit ? { status: defaultValues?.status ?? "ACTIVE" } : {}),
    },
  });

  const roleId = watch("roleId");
  const locationIds = watch("locationIds") ?? [];
  const status = watch("status");
  const employmentType = watch("employmentType");
  const payType = watch("compensation.payType") ?? (watch("hourlyWage") ? "HOURLY" : "HOURLY");

  function markDirty() {
    if (!dirty) setDirty(true);
  }

  async function onSubmit(data: EmployeeFormValues) {
    setSubmitError(null);
    const payload: Record<string, unknown> = {
      name: data.name || [data.legalFirstName, data.legalLastName].filter(Boolean).join(" "),
      legalFirstName: data.legalFirstName,
      legalMiddleName: data.legalMiddleName,
      legalLastName: data.legalLastName,
      preferredName: data.preferredName,
      email: data.email || data.workEmail,
      workEmail: data.workEmail || data.email,
      phone: data.phone || data.mobilePhone,
      mobilePhone: data.mobilePhone || data.phone,
      roleId: data.roleId,
      jobTitle: data.jobTitle,
      department: data.department,
      employeeNumber: data.employeeNumber || null,
      employmentType: data.employmentType || null,
      managerId: data.managerId || null,
      defaultLocationId: data.defaultLocationId || null,
      addressLine1: data.addressLine1,
      city: data.city,
      stateProvince: data.stateProvince,
      postalCode: data.postalCode,
      country: data.country,
      ...(data.pin ? { pin: data.pin } : {}),
      locationIds: data.locationIds ?? [],
      ...(data.hourlyWage !== undefined ? { hourlyWage: Number(data.hourlyWage) } : {}),
      ...(data.ptoAnnualHours !== undefined
        ? { ptoAnnualHours: Number(data.ptoAnnualHours) }
        : {}),
      ...(data.status ? { status: data.status } : {}),
    };

    if (canManageCompensation && data.compensationEffectiveFrom) {
      payload.compensation = {
        payType: payType,
        hourlyRate: data.compensationHourlyRate ? Number(data.compensationHourlyRate) : null,
        annualSalary: data.compensationAnnualSalary
          ? Number(data.compensationAnnualSalary)
          : null,
        effectiveFrom: data.compensationEffectiveFrom,
      };
    }

    if (
      isEdit &&
      data.emergencyContactName &&
      data.emergencyContactPhone &&
      canViewPersonal
    ) {
      payload.emergencyContacts = [
        {
          name: data.emergencyContactName,
          relationship: data.emergencyContactRelationship || "Emergency",
          primaryPhone: data.emergencyContactPhone,
          isPrimary: true,
        },
      ];
    }

    try {
      const res = await fetch(
        isEdit ? `/api/employees/${employeeId}` : "/api/employees",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as {
          error?: string;
          fieldErrors?: Record<string, string[]>;
        } | null;
        setSubmitError(err?.error ?? `Failed to ${isEdit ? "update" : "create"} employee`);
        toast.error(err?.error ?? `Failed to ${isEdit ? "update" : "create"} employee`);
        return;
      }

      toast.success(isEdit ? "Employee updated" : "Employee created");
      setDirty(false);
      router.push(isEdit ? `/employees/${employeeId}` : "/employees");
    } catch {
      setSubmitError(`Failed to ${isEdit ? "update" : "create"} employee`);
      toast.error(`Failed to ${isEdit ? "update" : "create"} employee`);
    }
  }

  function handleCancel() {
    if (dirty) {
      setLeaveConfirmOpen(true);
      return;
    }
    router.back();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-4xl space-y-6">
      {submitError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {submitError}
        </div>
      )}

      <Tabs defaultValue="personal" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap gap-1">
          <TabsTrigger value="personal">Personal</TabsTrigger>
          <TabsTrigger value="contact">Contact</TabsTrigger>
          <TabsTrigger value="employment">Employment</TabsTrigger>
          {canViewCompensation && <TabsTrigger value="compensation">Compensation</TabsTrigger>}
          <TabsTrigger value="locations">Locations & Access</TabsTrigger>
          {canViewPersonal && isEdit && <TabsTrigger value="emergency">Emergency</TabsTrigger>}
          <TabsTrigger value="pto">PTO & Leave</TabsTrigger>
        </TabsList>

        <TabsContent value="personal">
          <Card>
            <CardHeader><CardTitle>Personal Information</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="legalFirstName">Legal first name</Label>
                <Input id="legalFirstName" {...register("legalFirstName")} onChange={(e) => { register("legalFirstName").onChange(e); markDirty(); }} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="legalLastName">Legal last name</Label>
                <Input id="legalLastName" {...register("legalLastName")} onChange={(e) => { register("legalLastName").onChange(e); markDirty(); }} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="preferredName">Preferred name</Label>
                <Input id="preferredName" {...register("preferredName")} />
              </div>
              {canViewPersonal && (
                <div className="space-y-2">
                  <Label htmlFor="dateOfBirth">Date of birth</Label>
                  <Input id="dateOfBirth" type="date" {...register("dateOfBirth")} />
                </div>
              )}
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="name">Display name</Label>
                <Input id="name" {...register("name")} />
                {errors.name && <p className="text-sm text-red-600">{errors.name.message}</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contact">
          <Card>
            <CardHeader><CardTitle>Contact</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="workEmail">Work email</Label>
                <Input id="workEmail" type="email" {...register("workEmail")} />
                {errors.workEmail && <p className="text-sm text-red-600">{errors.workEmail.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Primary email (login)</Label>
                <Input id="email" type="email" {...register("email")} />
                {errors.email && <p className="text-sm text-red-600">{errors.email.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="mobilePhone">Mobile phone</Label>
                <Input id="mobilePhone" type="tel" {...register("mobilePhone")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" type="tel" {...register("phone")} />
              </div>
              {canViewPersonal && (
                <>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="addressLine1">Address line 1</Label>
                    <Input id="addressLine1" {...register("addressLine1")} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input id="city" {...register("city")} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="stateProvince">State / Province</Label>
                    <Input id="stateProvince" {...register("stateProvince")} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="postalCode">Postal code</Label>
                    <Input id="postalCode" {...register("postalCode")} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="country">Country</Label>
                    <Input id="country" {...register("country")} />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="employment">
          <Card>
            <CardHeader><CardTitle>Employment</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="employeeNumber">Employee number</Label>
                <Input id="employeeNumber" {...register("employeeNumber")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="jobTitle">Job title</Label>
                <Input id="jobTitle" {...register("jobTitle")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="department">Department</Label>
                <Input id="department" {...register("department")} />
              </div>
              <div className="space-y-2">
                <Label>Employment type</Label>
                <Select
                  value={employmentType ?? ""}
                  onValueChange={(v) => setValue("employmentType", v as EmployeeFormValues["employmentType"], { shouldValidate: true })}
                >
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FULL_TIME">Full-time</SelectItem>
                    <SelectItem value="PART_TIME">Part-time</SelectItem>
                    <SelectItem value="SEASONAL">Seasonal</SelectItem>
                    <SelectItem value="TEMPORARY">Temporary</SelectItem>
                    <SelectItem value="CONTRACTOR">Contractor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {managers.length > 0 && (
                <div className="space-y-2">
                  <Label>Manager</Label>
                  <Select
                    value={watch("managerId") ?? ""}
                    onValueChange={(v) => setValue("managerId", v)}
                  >
                    <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      {managers.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {isEdit && (
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={status}
                    onValueChange={(v) =>
                      setValue("status", v as EmployeeFormValues["status"], { shouldValidate: true })
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="INACTIVE">Inactive</SelectItem>
                      <SelectItem value="INVITED">Invited</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {canViewCompensation && (
          <TabsContent value="compensation">
            <Card>
              <CardHeader><CardTitle>Compensation</CardTitle></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="hourlyWage">Current hourly wage ($)</Label>
                  <Input id="hourlyWage" type="number" step="0.01" min="0" {...register("hourlyWage")} disabled={!canManageCompensation} />
                </div>
                {canManageCompensation && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="compensationEffectiveFrom">New rate effective from</Label>
                      <Input id="compensationEffectiveFrom" type="date" {...register("compensationEffectiveFrom")} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="compensationHourlyRate">New hourly rate ($)</Label>
                      <Input id="compensationHourlyRate" type="number" step="0.01" {...register("compensationHourlyRate")} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="compensationAnnualSalary">Annual salary ($)</Label>
                      <Input id="compensationAnnualSalary" type="number" step="0.01" {...register("compensationAnnualSalary")} />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="locations">
          <Card>
            <CardHeader><CardTitle>Locations & Access</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={roleId} onValueChange={(v) => setValue("roleId", v, { shouldValidate: true })}>
                    <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                    <SelectContent>
                      {roles.map((role) => (
                        <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.roleId && <p className="text-sm text-red-600">{errors.roleId.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pin">PIN (4 digits{isEdit ? ", blank to keep" : ""})</Label>
                  <Input id="pin" type="password" inputMode="numeric" maxLength={4} autoComplete="off" {...register("pin")} />
                </div>
              </div>
              {locations.length > 0 && (
                <div className="space-y-2">
                  <Label>Assigned locations</Label>
                  <div className="space-y-2">
                    {locations.map((location) => (
                      <div key={location.id} className="flex items-center gap-3">
                        <Checkbox
                          id={`location-${location.id}`}
                          checked={locationIds.includes(location.id)}
                          onCheckedChange={(checked) => {
                            const next = checked
                              ? [...locationIds, location.id]
                              : locationIds.filter((id) => id !== location.id);
                            setValue("locationIds", next);
                            markDirty();
                          }}
                        />
                        <Label htmlFor={`location-${location.id}`}>{location.name}</Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {canViewPersonal && isEdit && (
          <TabsContent value="emergency">
            <Card>
              <CardHeader><CardTitle>Emergency Contact</CardTitle></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="emergencyContactName">Name</Label>
                  <Input id="emergencyContactName" {...register("emergencyContactName")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="emergencyContactRelationship">Relationship</Label>
                  <Input id="emergencyContactRelationship" {...register("emergencyContactRelationship")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="emergencyContactPhone">Primary phone</Label>
                  <Input id="emergencyContactPhone" type="tel" {...register("emergencyContactPhone")} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="pto">
          <Card>
            <CardHeader><CardTitle>PTO & Leave</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ptoAnnualHours">Annual PTO hours</Label>
                <Input id="ptoAnnualHours" type="number" step="0.5" min="0" {...register("ptoAnnualHours")} />
              </div>
              {isEdit && (
                <div className="space-y-2">
                  <Label htmlFor="ptoBalanceHours">PTO balance (read-only snapshot)</Label>
                  <Input id="ptoBalanceHours" type="number" step="0.5" {...register("ptoBalanceHours")} disabled />
                  <p className="text-xs text-slate-500">Use ledger adjustments for audited balance changes.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (isEdit ? "Saving..." : "Creating...") : isEdit ? "Save Changes" : "Create Employee"}
        </Button>
        <Button type="button" variant="outline" onClick={handleCancel}>
          Cancel
        </Button>
      </div>

      <ConfirmDialog
        open={leaveConfirmOpen}
        onOpenChange={setLeaveConfirmOpen}
        title="Leave without saving?"
        description="You have unsaved changes. Leave anyway?"
        confirmLabel="Leave"
        variant="destructive"
        onConfirm={() => {
          setLeaveConfirmOpen(false);
          router.back();
        }}
      />
    </form>
  );
}
