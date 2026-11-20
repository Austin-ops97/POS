import { db } from "@/lib/db";

type AppointmentMeta = {
  customer?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
  location?: unknown;
  notes?: unknown;
  outlookEventId?: unknown;
};

export function outlookCalendarConfigured() {
  return Boolean(
    process.env.OUTLOOK_TENANT_ID?.trim() &&
      process.env.OUTLOOK_CLIENT_ID?.trim() &&
      process.env.OUTLOOK_CLIENT_SECRET?.trim() &&
      process.env.OUTLOOK_CALENDAR_USER?.trim()
  );
}

export function isCancelledAppointment(status: string | null | undefined) {
  return status === "CANCELLED";
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

async function graphToken(): Promise<string | null> {
  const tenant = process.env.OUTLOOK_TENANT_ID?.trim();
  const clientId = process.env.OUTLOOK_CLIENT_ID?.trim();
  const clientSecret = process.env.OUTLOOK_CLIENT_SECRET?.trim();
  if (!tenant || !clientId || !clientSecret) return null;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
    scope: "https://graph.microsoft.com/.default",
  });
  const response = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await response.json().catch(() => null)) as { access_token?: string } | null;
  return json?.access_token ?? null;
}

async function graphFetch(path: string, init: RequestInit, token: string) {
  const mailbox = encodeURIComponent(process.env.OUTLOOK_CALENDAR_USER!.trim());
  return fetch(`https://graph.microsoft.com/v1.0/users/${mailbox}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function deleteOutlookEvent(eventId: string, token: string) {
  const response = await graphFetch(`/events/${encodeURIComponent(eventId)}`, { method: "DELETE" }, token);
  if (response.status === 404) return;
  if (!response.ok) {
    throw new Error(`Outlook delete failed (${response.status})`);
  }
}

function eventPayload(record: {
  title: string;
  summary: string | null;
  metadata: AppointmentMeta | null;
}) {
  const meta = record.metadata ?? {};
  const startsAt = asString(meta.startsAt);
  const endsAt = asString(meta.endsAt);
  const subject = asString(meta.customer) || record.title;
  return {
    subject,
    body: { contentType: "text", content: asString(meta.notes) || record.summary || "" },
    location: { displayName: asString(meta.location) },
    start: { dateTime: new Date(startsAt).toISOString(), timeZone: "UTC" },
    end: { dateTime: new Date(endsAt).toISOString(), timeZone: "UTC" },
  };
}

export async function syncCalendarRecordToOutlook(input: {
  recordId: string;
  businessId: string;
  title: string;
  summary: string | null;
  status: string;
  archivedAt: Date | null;
  metadata: Record<string, unknown> | null;
  deleted?: boolean;
}): Promise<Record<string, unknown> | null> {
  const meta = (input.metadata ?? {}) as AppointmentMeta & Record<string, unknown>;
  const eventId = asString(meta.outlookEventId) || null;
  const inactive = Boolean(input.deleted || input.archivedAt || isCancelledAppointment(input.status));

  if (!outlookCalendarConfigured()) {
    return meta;
  }

  try {
    const token = await graphToken();
    if (!token) return meta;

    if (inactive) {
      if (eventId) {
        await deleteOutlookEvent(eventId, token);
        meta.outlookEventId = null;
        meta.outlookSyncStatus = "removed";
      } else {
        meta.outlookSyncStatus = "skipped_inactive";
      }
    } else {
      const payload = eventPayload({ title: input.title, summary: input.summary, metadata: meta });
      if (eventId) {
        const response = await graphFetch(`/events/${encodeURIComponent(eventId)}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        }, token);
        if (response.status === 404) {
          const created = await graphFetch("/events", { method: "POST", body: JSON.stringify(payload) }, token);
          const body = (await created.json().catch(() => null)) as { id?: string } | null;
          meta.outlookEventId = body?.id ?? null;
        } else if (response.ok) {
          meta.outlookSyncStatus = "updated";
        }
      } else {
        const created = await graphFetch("/events", { method: "POST", body: JSON.stringify(payload) }, token);
        const body = (await created.json().catch(() => null)) as { id?: string } | null;
        meta.outlookEventId = body?.id ?? null;
        meta.outlookSyncStatus = "created";
      }
    }

    if (!input.deleted) {
      await db.officeWorkspaceRecord.update({
        where: { id: input.recordId },
        data: { metadata: meta as object },
      });
    }
  } catch (error) {
    console.error("Outlook calendar sync failed", error);
  }
  return meta;
}
