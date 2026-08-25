export const MAX_EMAIL_ATTEMPTS = 5;
export const APP_NOTIFICATION_TYPE_REMINDER = "PROJECT_REMINDER";

export type AlertRecipient = {
  employeeId: string | null;
  email: string | null;
  name: string | null;
  emailRemindersEnabled: boolean;
  inAppRemindersEnabled: boolean;
};

export type DeliveryChannelPlan = {
  sendEmail: boolean;
  sendInApp: boolean;
  emailSkipReason: string | null;
  inAppSkipReason: string | null;
};

export function reminderRecipientDedupeKey(recipient: {
  employeeId: string | null;
  email: string | null;
}): string {
  if (recipient.employeeId) return `employee:${recipient.employeeId}`;
  const email = recipient.email?.trim().toLowerCase();
  if (email) return `email:${email}`;
  throw new Error("Recipient has no identity");
}

export function normalizeRecipientEmail(email: string | null | undefined): string | null {
  const normalized = email?.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) return null;
  return normalized;
}

export function planRecipientChannels(recipient: AlertRecipient): DeliveryChannelPlan {
  const email = normalizeRecipientEmail(recipient.email);
  const emailSkipReason = !email
    ? "no_email"
    : recipient.emailRemindersEnabled === false
      ? "email_disabled"
      : null;
  const inAppSkipReason = !recipient.employeeId
    ? "external_recipient"
    : recipient.inAppRemindersEnabled === false
      ? "in_app_disabled"
      : null;
  return {
    sendEmail: emailSkipReason == null,
    sendInApp: inAppSkipReason == null,
    emailSkipReason,
    inAppSkipReason,
  };
}

export function shouldRetryEmail(status: string | null | undefined, attemptCount: number): boolean {
  if (status === "SENT" || status === "SKIPPED") return false;
  return attemptCount < MAX_EMAIL_ATTEMPTS;
}

export function shouldAdvanceSchedule(params: {
  failedEmail: boolean;
  retryableFailure: boolean;
}): boolean {
  if (params.retryableFailure) return false;
  return true;
}

export type ExistingDelivery = {
  id: string;
  status: string;
  inAppStatus: string | null;
  attemptCount: number;
};

export type RecipientAlertResult = {
  dedupeKey: string;
  emailStatus: "SENT" | "FAILED" | "SKIPPED" | "PENDING";
  inAppStatus: "SENT" | "SKIPPED" | "FAILED";
  skippedDuplicate: boolean;
  retrying: boolean;
};

export async function deliverRecipientAlert(input: {
  recipient: AlertRecipient;
  existing: ExistingDelivery | null;
  sendEmail: () => Promise<{ messageId: string | null }>;
  notifyInApp: () => Promise<void>;
}): Promise<RecipientAlertResult> {
  const dedupeKey = reminderRecipientDedupeKey(input.recipient);
  const plan = planRecipientChannels(input.recipient);

  if (
    input.existing &&
    (input.existing.status === "SENT" || input.existing.status === "SKIPPED") &&
    (input.existing.inAppStatus === "SENT" ||
      input.existing.inAppStatus === "SKIPPED" ||
      input.existing.inAppStatus == null)
  ) {
    return {
      dedupeKey,
      emailStatus: input.existing.status as "SENT" | "SKIPPED",
      inAppStatus: (input.existing.inAppStatus as "SENT" | "SKIPPED" | null) ?? "SKIPPED",
      skippedDuplicate: true,
      retrying: false,
    };
  }

  const retrying = Boolean(
    input.existing && shouldRetryEmail(input.existing.status, input.existing.attemptCount)
  );

  let emailStatus: RecipientAlertResult["emailStatus"] = "SKIPPED";
  if (plan.sendEmail) {
    try {
      await input.sendEmail();
      emailStatus = "SENT";
    } catch {
      emailStatus = "FAILED";
    }
  }

  let inAppStatus: RecipientAlertResult["inAppStatus"] = "SKIPPED";
  if (plan.sendInApp) {
    if (input.existing?.inAppStatus === "SENT") {
      inAppStatus = "SENT";
    } else {
      try {
        await input.notifyInApp();
        inAppStatus = "SENT";
      } catch {
        inAppStatus = "FAILED";
      }
    }
  }

  return {
    dedupeKey,
    emailStatus,
    inAppStatus,
    skippedDuplicate: false,
    retrying,
  };
}
