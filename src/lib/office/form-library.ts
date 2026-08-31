import { isFormMetadata, type FormMetadata } from "@/lib/office/form-types";
import type { OfficeWorkspaceRecordSummary } from "@/lib/office/workspace-service";

export type FormRecordSummary = OfficeWorkspaceRecordSummary & {
  metadata: FormMetadata;
};

export type FormSort = "updated" | "name" | "responses";
export type FormFilter = "all" | "published" | "draft";

export function isFormRecord(record: OfficeWorkspaceRecordSummary): record is FormRecordSummary {
  return isFormMetadata(record.metadata);
}

export function getFormRecords(records: OfficeWorkspaceRecordSummary[]): FormRecordSummary[] {
  return records.filter(isFormRecord);
}

export function buildResponseCountMap(records: OfficeWorkspaceRecordSummary[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const record of records) {
    if (record.metadata?.kind !== "response") continue;
    const formId = typeof record.metadata.formId === "string" ? record.metadata.formId : "";
    if (!formId) continue;
    counts.set(formId, (counts.get(formId) ?? 0) + 1);
  }
  return counts;
}

export function browseForms(params: {
  forms: FormRecordSummary[];
  query: string;
  filter: FormFilter;
  sort: FormSort;
  responseCounts: Map<string, number>;
}): FormRecordSummary[] {
  const normalized = params.query.trim().toLowerCase();

  const filtered = params.forms.filter((form) => {
    if (params.filter === "published" && !form.metadata.published) return false;
    if (params.filter === "draft" && form.metadata.published) return false;
    if (!normalized) return true;
    const haystack = `${form.title} ${form.summary ?? ""} ${form.metadata.description ?? ""}`.toLowerCase();
    return haystack.includes(normalized);
  });

  return filtered.sort((a, b) => {
    if (params.sort === "name") return a.title.localeCompare(b.title);
    if (params.sort === "responses") {
      return (params.responseCounts.get(b.id) ?? 0) - (params.responseCounts.get(a.id) ?? 0);
    }
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}
