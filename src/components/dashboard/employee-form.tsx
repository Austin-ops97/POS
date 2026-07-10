"use client";

import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { employeeSchema } from "@/lib/validations";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const employeeFormSchema = employeeSchema.extend({
  pin: z.union([z.string().length(4), z.literal("")]).optional(),
  hourlyWage: z.coerce.number().min(0).optional(),
  ptoAnnualHours: z.coerce.number().min(0).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "INVITED"]).optional(),
  ptoBalanceHours: z.coerce.number().min(0).optional(),
});

type EmployeeFormValues = z.infer<typeof employeeFormSchema>;

type EmployeeFormProps = {
  roles: Array<{ id: string; name: string }>;
  locations: Array<{ id: string; name: string }>;
  employeeId?: string;
  defaultValues?: Partial<EmployeeFormValues & { locationIds: string[] }>;
};

export function EmployeeForm({
  roles,
  locations,
  employeeId,
  defaultValues,
}: EmployeeFormProps) {
  const router = useRouter();
  const isEdit = !!employeeId;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeFormSchema) as Resolver<EmployeeFormValues>,
    defaultValues: {
      name: defaultValues?.name ?? "",
      email: defaultValues?.email ?? "",
      phone: defaultValues?.phone ?? "",
      roleId: defaultValues?.roleId ?? "",
      pin: "",
      locationIds: defaultValues?.locationIds ?? [],
      hourlyWage: defaultValues?.hourlyWage ?? undefined,
      ptoAnnualHours: defaultValues?.ptoAnnualHours ?? undefined,
      ...(isEdit ? { ptoBalanceHours: defaultValues?.ptoBalanceHours ?? undefined } : {}),
      ...(isEdit ? { status: defaultValues?.status ?? "ACTIVE" } : {}),
    },
  });

  const roleId = watch("roleId");
  const locationIds = watch("locationIds") ?? [];
  const status = watch("status");

  async function onSubmit(data: EmployeeFormValues) {
    const payload = {
      name: data.name,
      email: data.email,
      phone: data.phone || undefined,
      roleId: data.roleId,
      ...(data.pin ? { pin: data.pin } : {}),
      ...(data.locationIds && data.locationIds.length > 0
        ? { locationIds: data.locationIds }
        : isEdit
          ? { locationIds: data.locationIds ?? [] }
          : {}),
      ...(data.hourlyWage !== undefined
        ? { hourlyWage: Number(data.hourlyWage) }
        : {}),
      ...(data.ptoAnnualHours !== undefined
        ? { ptoAnnualHours: Number(data.ptoAnnualHours) }
        : {}),
      ...(data.ptoBalanceHours !== undefined
        ? { ptoBalanceHours: Number(data.ptoBalanceHours) }
        : {}),
      ...(data.status ? { status: data.status } : {}),
    };

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
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(err?.error ?? `Failed to ${isEdit ? "update" : "create"} employee`);
        return;
      }

      toast.success(isEdit ? "Employee updated" : "Employee created");
      router.push(isEdit ? `/employees/${employeeId}` : "/employees");
      router.refresh();
    } catch {
      toast.error(`Failed to ${isEdit ? "update" : "create"} employee`);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Employee Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" {...register("name")} />
            {errors.name && (
              <p className="text-sm text-red-600">{errors.name.message}</p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...register("email")} />
              {errors.email && (
                <p className="text-sm text-red-600">{errors.email.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" type="tel" {...register("phone")} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={roleId}
                onValueChange={(v) => setValue("roleId", v, { shouldValidate: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.roleId && (
                <p className="text-sm text-red-600">{errors.roleId.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="pin">
                PIN (4 digits{isEdit ? ", leave blank to keep" : ", optional"})
              </Label>
              <Input
                id="pin"
                type="password"
                inputMode="numeric"
                maxLength={4}
                autoComplete="off"
                {...register("pin")}
              />
              {errors.pin && (
                <p className="text-sm text-red-600">{errors.pin.message}</p>
              )}
            </div>
          </div>
          {isEdit && (
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={status}
                onValueChange={(v) =>
                  setValue("status", v as EmployeeFormValues["status"], {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                  <SelectItem value="INVITED">Invited</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {locations.length > 0 && (
            <div className="space-y-2">
              <Label>Locations</Label>
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

      <Card>
        <CardHeader>
          <CardTitle>Compensation & PTO</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="hourlyWage">Hourly wage ($)</Label>
              <Input
                id="hourlyWage"
                type="number"
                step="0.01"
                min="0"
                {...register("hourlyWage")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ptoAnnualHours">Annual PTO hours</Label>
              <Input
                id="ptoAnnualHours"
                type="number"
                step="0.5"
                min="0"
                {...register("ptoAnnualHours")}
              />
            </div>
          </div>
          {isEdit && (
            <div className="space-y-2">
              <Label htmlFor="ptoBalanceHours">PTO balance (hours)</Label>
              <Input
                id="ptoBalanceHours"
                type="number"
                step="0.5"
                min="0"
                {...register("ptoBalanceHours")}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? isEdit
              ? "Saving..."
              : "Creating..."
            : isEdit
              ? "Save Changes"
              : "Create Employee"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
