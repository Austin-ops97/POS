import { ZodError } from "zod";

const FIELD_LABELS: Record<string, string> = {
  dateFrom: "From",
  dateTo: "To",
  minAmount: "Min amount",
  maxAmount: "Max amount",
  receiptIds: "Selected receipts",
  receiptNumber: "Receipt number",
  companyCardId: "Payment account",
  employeeId: "Employee",
  categoryId: "Category",
  locationId: "Location",
  merchant: "Merchant",
  project: "Project",
  q: "OCR text",
  allFiltered: "Download all filtered",
  includeCsv: "CSV index",
};

function fieldLabel(path: PropertyKey[]): string {
  const keys = path.map(String);
  const named = [...keys].reverse().find((key) => FIELD_LABELS[key] || !/^\d+$/.test(key));
  if (!named) return "Request";
  if (FIELD_LABELS[named]) return FIELD_LABELS[named];
  return named
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (char) => char.toUpperCase());
}

export function zodFieldErrors(error: ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".") || "_form";
    fieldErrors[path] = fieldErrors[path] ?? [];
    fieldErrors[path].push(issue.message);
  }
  return fieldErrors;
}

/** User-facing summary of a Zod failure. Never the bare label "Validation error". */
export function validationErrorMessage(error: ZodError): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const issue of error.issues) {
    const text = `${fieldLabel(issue.path)}: ${issue.message}`;
    if (seen.has(text)) continue;
    seen.add(text);
    parts.push(text);
    if (parts.length >= 4) break;
  }
  return parts.join(". ") || "Check the form and try again.";
}
