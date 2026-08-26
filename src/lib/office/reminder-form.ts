import { reminderHasRecipients } from "@/lib/validations/reminders";

export type ReminderFormPayload = {
  projectId?: string;
  title: string;
  message: string | null;
  scheduledAt: string;
  recurrence: string;
  intervalCount: number;
  sendBeforeMinutes: number;
  timezone: string;
  recipients: {
    includeOwner: boolean;
    includeAdmins: boolean;
    includeAllEmployees: boolean;
    includeAllCustomers: boolean;
    employeeIds: string[];
    emails: string[];
  };
};

/**
 * Capture the submitting form immediately. React 19 nulls `event.currentTarget`
 * after the handler yields, which is the root cause of
 * `null is not an object (evaluating 'e.currentTarget.reset')`.
 */
export function captureSubmitForm<T>(event: { currentTarget: T | null }): T {
  const form = event.currentTarget;
  if (form == null) {
    throw new TypeError("null is not an object (evaluating 'e.currentTarget.reset')");
  }
  return form;
}

export function resetFormSafely(form: { reset: () => void } | null | undefined) {
  form?.reset();
}

export function describeReminderRecipients(recipients: {
  includeOwner?: boolean;
  includeAdmins?: boolean;
  includeAllEmployees?: boolean;
  includeAllCustomers?: boolean;
  employeeIds?: string[];
  emails?: string[];
}) {
  const parts: string[] = [];
  if (recipients.includeAllEmployees) parts.push("All employees");
  if (recipients.includeAllCustomers) parts.push("All customers");
  if (recipients.includeOwner) parts.push("Project owner");
  if (recipients.includeAdmins) parts.push("Admins");
  if (recipients.employeeIds?.length) {
    parts.push(`${recipients.employeeIds.length} employee${recipients.employeeIds.length === 1 ? "" : "s"}`);
  }
  if (recipients.emails?.length) {
    parts.push(`${recipients.emails.length} email${recipients.emails.length === 1 ? "" : "s"}`);
  }
  return parts.join(" · ") || "No recipients";
}

export function reminderPayloadFromFormData(form: FormData): ReminderFormPayload | { error: string } {
  const title = String(form.get("title") || "").trim();
  if (!title) return { error: "Title is required" };

  const scheduledRaw = String(form.get("scheduledAt") || "");
  const scheduledAt = new Date(scheduledRaw);
  if (!scheduledRaw || Number.isNaN(scheduledAt.getTime())) {
    return { error: "Choose a valid date and time" };
  }

  const emails = String(form.get("emails") || "")
    .split(/[,;\s]+/)
    .map((email) => email.trim())
    .filter(Boolean);
  if (emails.some((email) => !email.includes("@"))) {
    return { error: "Enter valid email addresses" };
  }
  const employeeIds = form.getAll("employeeIds").map(String).filter(Boolean);
  const recipients = {
    includeOwner: form.get("includeOwner") === "on",
    includeAdmins: form.get("includeAdmins") === "on",
    includeAllEmployees: form.get("includeAllEmployees") === "on",
    includeAllCustomers: form.get("includeAllCustomers") === "on",
    employeeIds,
    emails,
  };

  if (!reminderHasRecipients(recipients)) {
    return { error: "Choose at least one recipient" };
  }

  const projectId = String(form.get("projectId") || "").trim();

  return {
    ...(projectId ? { projectId } : {}),
    title,
    message: String(form.get("message") || "").trim() || null,
    scheduledAt: scheduledAt.toISOString(),
    recurrence: String(form.get("recurrence") || "ONE_TIME"),
    intervalCount: Number(form.get("intervalCount") || 1),
    sendBeforeMinutes: Number(form.get("sendBeforeMinutes") || 0),
    timezone: String(form.get("timezone") || "America/Chicago").trim() || "America/Chicago",
    recipients,
  };
}

/** Unsafe pattern that caused the original Safari/React error after an await. */
export function resetUsingEventCurrentTarget(event: { currentTarget: { reset: () => void } | null }) {
  const currentTarget = event.currentTarget;
  if (currentTarget == null) {
    throw new TypeError("null is not an object (evaluating 'e.currentTarget.reset')");
  }
  currentTarget.reset();
}
