"use client";

import { useForm } from "react-hook-form";
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
});

type EmployeeFormValues = z.infer<typeof employeeFormSchema>;

type EmployeeFormProps = {
  roles: Array<{ id: string; name: string }>;
  locations: Array<{ id: string; name: string }>;
};

export function EmployeeForm({ roles, locations }: EmployeeFormProps) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      roleId: "",
      pin: "",
      locationIds: [],
    },
  });

  const roleId = watch("roleId");
  const locationIds = watch("locationIds") ?? [];

  async function onSubmit(data: EmployeeFormValues) {
    const payload = {
      name: data.name,
      email: data.email,
      phone: data.phone || undefined,
      roleId: data.roleId,
      ...(data.pin ? { pin: data.pin } : {}),
      ...(data.locationIds && data.locationIds.length > 0
        ? { locationIds: data.locationIds }
        : {}),
    };

    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        toast.error(err?.error ?? "Failed to create employee");
        return;
      }

      toast.success("Employee created");
      router.push("/employees");
      router.refresh();
    } catch {
      toast.error("Failed to create employee");
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
              <Label htmlFor="pin">PIN (4 digits, optional)</Label>
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
                    <Label htmlFor={`location-${location.id}`}>
                      {location.name}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creating..." : "Create Employee"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
