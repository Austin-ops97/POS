import { Resend } from "resend";
import { db } from "@/lib/db";
import {
  TASK_ASSIGNED_NOTIFICATION_TYPE,
  TASK_ASSIGNMENTS_HREF,
  shouldNotifyTaskAssignee,
} from "@/lib/office/task-assignments";

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]!);

function taskAssignmentsUrl() {
  const base = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://www.emeraldvalestudios.online").replace(
    /\/$/,
    ""
  );
  return `${base}${TASK_ASSIGNMENTS_HREF}`;
}

async function sendTaskEmail(input: {
  to: string;
  assigneeName: string;
  actorName: string;
  businessName: string;
  title: string;
  dueAt: Date | null;
  notes: string;
}) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.OFFICE_FROM_EMAIL?.trim() || process.env.RECEIPTS_FROM_EMAIL?.trim();
  if (!apiKey || !from) return { skipped: true as const };

  const due = input.dueAt
    ? new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(input.dueAt)
    : "No due time set";
  const firstName = input.assigneeName.trim().split(/\s+/)[0] || "there";
  const body = [
    `Hi ${firstName},`,
    "",
    `${input.actorName} assigned you a task at ${input.businessName}.`,
    "",
    input.title,
    `Due: ${due}`,
    input.notes ? `Notes: ${input.notes}` : "",
    "",
    `Open it in EmeraldPOS: ${taskAssignmentsUrl()}`,
  ]
    .filter((line) => line !== "")
    .join("\n");

  const result = await new Resend(apiKey).emails.send({
    from,
    to: input.to,
    subject: `New task: ${input.title}`,
    text: body,
    html: `<div style="font-family:system-ui,sans-serif;line-height:1.6;color:#0f172a">${escapeHtml(body).replace(/\n/g, "<br/>")}</div>`,
  });
  if (result.error) throw new Error(result.error.message);
  return { skipped: false as const, messageId: result.data?.id ?? null };
}

export async function notifyTaskAssignee(params: {
  workspace: string;
  businessId: string;
  businessName: string;
  actorId: string;
  actorName: string;
  assigneeId: string | null | undefined;
  previousAssigneeId?: string | null;
  isCreate: boolean;
  title: string;
  notes?: string | null;
  dueAt?: Date | null;
}) {
  if (
    !shouldNotifyTaskAssignee({
      workspace: params.workspace,
      actorId: params.actorId,
      assigneeId: params.assigneeId,
      previousAssigneeId: params.previousAssigneeId,
      isCreate: params.isCreate,
    })
  ) {
    return { notified: false as const };
  }

  const assignee = await db.employeeProfile.findFirst({
    where: {
      id: params.assigneeId!,
      businessId: params.businessId,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      email: true,
      emailRemindersEnabled: true,
      inAppRemindersEnabled: true,
    },
  });
  if (!assignee) return { notified: false as const };

  const body = params.notes?.trim()
    ? `${params.actorName} assigned you “${params.title}”. ${params.notes.trim()}`
    : `${params.actorName} assigned you “${params.title}”.`;

  if (assignee.inAppRemindersEnabled !== false) {
    await db.appNotification.create({
      data: {
        businessId: params.businessId,
        employeeId: assignee.id,
        type: TASK_ASSIGNED_NOTIFICATION_TYPE,
        title: "New task assigned",
        body,
        href: TASK_ASSIGNMENTS_HREF,
      },
    });
  }

  if (assignee.emailRemindersEnabled !== false && assignee.email.includes("@")) {
    try {
      await sendTaskEmail({
        to: assignee.email,
        assigneeName: assignee.name,
        actorName: params.actorName,
        businessName: params.businessName,
        title: params.title,
        dueAt: params.dueAt ?? null,
        notes: params.notes?.trim() ?? "",
      });
    } catch (error) {
      console.error("Task assignment email failed", error);
    }
  }

  return { notified: true as const };
}
