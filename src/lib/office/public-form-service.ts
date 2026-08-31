import { db } from "@/lib/db";
import {
  finalizedFormOptions,
  isFormMetadata,
  type FormField,
  type FormMetadata,
} from "@/lib/office/form-types";

export type PublicFormDefinition = {
  id: string;
  title: string;
  description: string;
  fields: Array<Omit<FormField, "options"> & { options: string[] }>;
};

function normalizeFields(fields: FormField[]): PublicFormDefinition["fields"] {
  return fields.map((field) => ({
    ...field,
    options: finalizedFormOptions(field.options),
  }));
}

function parseFormRecord(record: {
  id: string;
  title: string;
  summary: string | null;
  metadata: unknown;
  archivedAt: Date | null;
}): PublicFormDefinition | null {
  if (record.archivedAt) return null;
  if (!record.metadata || typeof record.metadata !== "object" || Array.isArray(record.metadata)) return null;
  const metadata = record.metadata as Record<string, unknown>;
  if (!isFormMetadata(metadata) || !metadata.published) return null;
  return {
    id: record.id,
    title: record.title,
    description: metadata.description,
    fields: normalizeFields(metadata.fields),
  };
}

export async function getPublicForm(formId: string): Promise<PublicFormDefinition | null> {
  const record = await db.officeWorkspaceRecord.findFirst({
    where: {
      id: formId,
      workspace: "forms-approvals",
      archivedAt: null,
    },
    select: {
      id: true,
      title: true,
      summary: true,
      metadata: true,
      archivedAt: true,
    },
  });
  if (!record) return null;
  return parseFormRecord(record);
}

export async function submitPublicFormResponse(
  formId: string,
  answers: Record<string, string | boolean>,
  ipAddress?: string
): Promise<{ id: string }> {
  const record = await db.officeWorkspaceRecord.findFirst({
    where: {
      id: formId,
      workspace: "forms-approvals",
      archivedAt: null,
    },
    select: {
      id: true,
      businessId: true,
      createdById: true,
      title: true,
      metadata: true,
      archivedAt: true,
    },
  });
  if (!record) throw new Error("Form not found");
  if (!record.metadata || typeof record.metadata !== "object" || Array.isArray(record.metadata)) {
    throw new Error("Form not found");
  }
  const metadata = record.metadata as FormMetadata;
  if (!isFormMetadata(metadata) || !metadata.published) throw new Error("Form is not published");

  const fields = normalizeFields(metadata.fields);
  for (const field of fields) {
    if (!field.required) continue;
    const value = answers[field.id];
    if (field.type === "checkbox") {
      if (value !== true) throw new Error(`${field.label} is required`);
      continue;
    }
    if (typeof value !== "string" || !value.trim()) throw new Error(`${field.label} is required`);
  }

  const created = await db.officeWorkspaceRecord.create({
    data: {
      businessId: record.businessId,
      workspace: "forms-approvals",
      createdById: record.createdById,
      title: `Response · ${record.title}`,
      summary: `Submitted ${new Date().toLocaleString()}`,
      status: "NEEDS_REVIEW",
      metadata: {
        kind: "response",
        formId: record.id,
        formTitle: record.title,
        answers,
        fields,
      },
    },
    select: { id: true },
  });

  await db.officeAuditEvent.create({
    data: {
      businessId: record.businessId,
      actorId: null,
      action: "PUBLIC_FORM_RESPONSE",
      details: { recordId: created.id, formId: record.id, title: record.title },
      ipAddress,
    },
  }).catch(() => {
    // Audit logging should not block public submissions.
  });

  return created;
}
