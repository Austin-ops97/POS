export type FormFieldType = "text" | "email" | "number" | "textarea" | "select" | "checkbox";

export type FormField = {
  id: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  options: string[];
};

export type FormMetadata = {
  kind: "form";
  description: string;
  fields: FormField[];
  published?: boolean;
};

export type FormResponseMetadata = {
  kind: "response";
  formId: string;
  formTitle: string;
  answers: Record<string, string | boolean>;
  fields?: FormField[];
};

export function finalizedFormOptions(options: string[]): string[] {
  return options.map((option) => option.trim()).filter(Boolean);
}

export function isFormMetadata(metadata: Record<string, unknown> | null | undefined): metadata is FormMetadata {
  return metadata?.kind === "form";
}

export function isFormResponseMetadata(
  metadata: Record<string, unknown> | null | undefined
): metadata is FormResponseMetadata {
  return metadata?.kind === "response";
}

export function publicFormPath(formId: string): string {
  return `/forms/${formId}`;
}
