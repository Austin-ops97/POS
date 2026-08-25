import { customerSchema } from "@/lib/validations";
import type { z } from "zod";

export type CustomerFormValues = z.infer<typeof customerSchema>;

export type RegisterCustomer = {
  id: string;
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
};

export function customerDisplayName(customer: {
  firstName: string;
  lastName?: string | null;
}) {
  return `${customer.firstName}${customer.lastName ? ` ${customer.lastName}` : ""}`.trim();
}

export function createCustomerPayload(values: CustomerFormValues) {
  return {
    firstName: values.firstName.trim(),
    lastName: values.lastName?.trim() || undefined,
    email: values.email?.trim() || undefined,
    phone: values.phone?.trim() || undefined,
    address: values.address?.trim() || undefined,
    notes: values.notes?.trim() || undefined,
    tags: values.tags,
    marketingOptIn: values.marketingOptIn,
  };
}

/** Returns true if this caller won the in-flight lock and may submit. */
export function beginExclusiveSubmit(inFlight: { current: boolean }): boolean {
  if (inFlight.current) return false;
  inFlight.current = true;
  return true;
}

export function endExclusiveSubmit(inFlight: { current: boolean }) {
  inFlight.current = false;
}

export function parseCreatedCustomer(body: unknown): RegisterCustomer | null {
  if (!body || typeof body !== "object") return null;
  const value = body as Partial<RegisterCustomer>;
  if (typeof value.id !== "string" || !value.id || typeof value.firstName !== "string") {
    return null;
  }
  return {
    id: value.id,
    firstName: value.firstName,
    lastName: typeof value.lastName === "string" ? value.lastName : value.lastName ?? null,
    email: typeof value.email === "string" ? value.email : value.email ?? null,
    phone: typeof value.phone === "string" ? value.phone : value.phone ?? null,
  };
}
