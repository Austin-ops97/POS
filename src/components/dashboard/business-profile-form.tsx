"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const BUSINESS_TYPES = [
  { value: "RETAIL", label: "Retail" },
  { value: "SERVICE", label: "Service" },
  { value: "RENTAL", label: "Rental" },
  { value: "RESTAURANT", label: "Restaurant" },
  { value: "HYBRID", label: "Hybrid" },
] as const;

export type BusinessProfileValues = {
  name: string;
  legalName: string;
  type: (typeof BUSINESS_TYPES)[number]["value"];
  phone: string;
  email: string;
  website: string;
  primaryColor: string;
};

type BusinessProfileFormProps = {
  initial: BusinessProfileValues;
  canEdit: boolean;
};

export function BusinessProfileForm({ initial, canEdit }: BusinessProfileFormProps) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;

    if (!values.name.trim()) {
      toast.error("Business name is required");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/business/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name.trim(),
          legalName: values.legalName.trim() || undefined,
          type: values.type,
          phone: values.phone.trim() || undefined,
          email: values.email.trim(),
          website: values.website.trim(),
          primaryColor: values.primaryColor.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to save business profile");
        return;
      }
      toast.success("Business profile saved");
      router.refresh();
    } catch {
      toast.error("Failed to save business profile");
    } finally {
      setSaving(false);
    }
  }

  if (!canEdit) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label>Business name</Label>
          <Input value={values.name} readOnly />
        </div>
        <div className="space-y-2">
          <Label>Legal name</Label>
          <Input value={values.legalName} readOnly />
        </div>
        <div className="space-y-2">
          <Label>Type</Label>
          <Input value={values.type} readOnly />
        </div>
        <div className="space-y-2">
          <Label>Phone</Label>
          <Input value={values.phone} readOnly />
        </div>
        <div className="space-y-2">
          <Label>Email</Label>
          <Input value={values.email} readOnly />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>Website</Label>
          <Input value={values.website} readOnly />
        </div>
        <p className="text-sm text-slate-500 sm:col-span-2">
          Only business owners and admins can edit this profile.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="business-name">Business name</Label>
        <Input
          id="business-name"
          required
          value={values.name}
          onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="legal-name">Legal name</Label>
        <Input
          id="legal-name"
          value={values.legalName}
          onChange={(e) => setValues((v) => ({ ...v, legalName: e.target.value }))}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="business-type">Type</Label>
        <Select
          value={values.type}
          onValueChange={(type) =>
            setValues((v) => ({
              ...v,
              type: type as BusinessProfileValues["type"],
            }))
          }
        >
          <SelectTrigger id="business-type">
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            {BUSINESS_TYPES.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="business-phone">Phone</Label>
        <Input
          id="business-phone"
          type="tel"
          value={values.phone}
          onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="business-email">Email</Label>
        <Input
          id="business-email"
          type="email"
          value={values.email}
          onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
        />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="business-website">Website</Label>
        <Input
          id="business-website"
          type="url"
          placeholder="https://example.com"
          value={values.website}
          onChange={(e) => setValues((v) => ({ ...v, website: e.target.value }))}
        />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="primary-color">Brand color</Label>
        <div className="flex items-center gap-3">
          <Input
            id="primary-color"
            type="color"
            value={values.primaryColor}
            onChange={(e) =>
              setValues((v) => ({ ...v, primaryColor: e.target.value }))
            }
            className="h-11 w-16 cursor-pointer p-1"
          />
          <Input
            value={values.primaryColor}
            onChange={(e) =>
              setValues((v) => ({ ...v, primaryColor: e.target.value }))
            }
            className="max-w-[10rem] font-mono text-sm"
            pattern="^#[0-9A-Fa-f]{6}$"
            placeholder="#1e3a5f"
          />
        </div>
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save business profile"}
        </Button>
      </div>
    </form>
  );
}
