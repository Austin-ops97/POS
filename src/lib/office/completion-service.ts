import { Resend } from "resend";
import type { AuthContext } from "@/lib/auth";
import { hasPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import { requireModule } from "@/lib/access-control";
import { deleteBlob, uploadBlob } from "@/lib/storage/blob-storage";
import {
  canDeleteAttachment,
  canReopenProject,
  canReviewSubmission,
  canSubmitForApproval,
  canUploadAttachments,
  projectStatusAfterReview,
  submissionStatusAfterReview,
  validatePhotoCount,
  type ReviewAction,
} from "@/lib/office/completion-helpers";

export {
  validatePhotoCount,
  canSubmitForApproval,
  canUploadAttachments,
  canDeleteAttachment,
  canReviewSubmission,
  projectStatusAfterReview,
  submissionStatusAfterReview,
  canReopenProject,
} from "@/lib/office/completion-helpers";

const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]!);

async function sendMail(to: string, subject: string, body: string) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.OFFICE_FROM_EMAIL?.trim() || process.env.RECEIPTS_FROM_EMAIL?.trim();
  if (!apiKey || !from) return { skipped: true as const };
  const result = await new Resend(apiKey).emails.send({
    from,
    to,
    subject,
    text: body,
    html: `<div style="font-family:system-ui,sans-serif;white-space:pre-wrap;line-height:1.6">${escapeHtml(body)}</div>`,
  });
  if (result.error) throw new Error(result.error.message);
  return { skipped: false as const, messageId: result.data?.id ?? null };
}

async function assertCompletionEnabled(businessId: string) {
  const [moduleOk, settings] = await Promise.all([
    db.moduleSetting.findUnique({
      where: { businessId_module: { businessId, module: "PROJECT_COMPLETION" } },
      select: { enabled: true },
    }),
    db.businessSetting.findUnique({ where: { businessId } }),
  ]);
  if (moduleOk?.enabled === false) throw new Error("Module disabled: PROJECT_COMPLETION");
  if (settings && !settings.enableProjectCompletion) {
    throw new Error("Project completion is disabled for this business");
  }
  return (
    settings ?? {
      enableProjectCompletion: true,
      requireCompletionPhotos: true,
      minCompletionPhotos: 1,
      requireSupervisorApproval: true,
      allowReopenApprovedProjects: true,
      defaultProjectSupervisorId: null as string | null,
    }
  );
}

async function getProjectOrThrow(businessId: string, projectId: string) {
  const project = await db.officeWorkspaceRecord.findFirst({
    where: {
      id: projectId,
      businessId,
      workspace: "projects",
      archivedAt: null,
    },
    include: {
      assignedTo: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });
  if (!project) throw new Error("Project not found");
  return project;
}

function serializeAttachment(row: {
  id: string;
  projectId: string;
  submissionId: string | null;
  storageUrl: string;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  caption: string | null;
  createdAt: Date;
  uploadedBy: { id: string; name: string };
}) {
  return {
    id: row.id,
    projectId: row.projectId,
    submissionId: row.submissionId,
    storageUrl: row.storageUrl,
    storageKey: row.storageKey,
    originalFilename: row.originalFilename,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    caption: row.caption,
    createdAt: row.createdAt.toISOString(),
    uploadedBy: row.uploadedBy,
  };
}

export async function listAttachments(ctx: AuthContext, projectId: string) {
  await requireModule(ctx, "PROJECT_COMPLETION");
  await assertCompletionEnabled(ctx.business.id);
  await getProjectOrThrow(ctx.business.id, projectId);

  const rows = await db.projectAttachment.findMany({
    where: { businessId: ctx.business.id, projectId, deletedAt: null },
    include: { uploadedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(serializeAttachment);
}

export async function uploadAttachment(
  ctx: AuthContext,
  projectId: string,
  input: {
    fileName: string;
    mimeType: string;
    data: Buffer;
    caption?: string | null;
  }
) {
  if (!hasPermission(ctx, PERMISSIONS.SUBMIT_PROJECT_COMPLETION)) {
    throw new Error(`Missing permission: ${PERMISSIONS.SUBMIT_PROJECT_COMPLETION}`);
  }
  await requireModule(ctx, "PROJECT_COMPLETION");
  await assertCompletionEnabled(ctx.business.id);
  const project = await getProjectOrThrow(ctx.business.id, projectId);

  if (!canUploadAttachments(project.status)) {
    throw new Error("Photos can only be added before submission is pending approval");
  }

  const mime = input.mimeType.toLowerCase();
  if (!ALLOWED_MIME.has(mime)) throw new Error("Only JPEG, PNG, WebP, or HEIC images are allowed");
  if (!input.data.length) throw new Error("File is empty");
  if (input.data.length > MAX_PHOTO_BYTES) throw new Error("Photo exceeds the 12 MB limit");

  const uploaded = await uploadBlob({
    businessId: ctx.business.id,
    projectId,
    filename: input.fileName,
    body: input.data,
    contentType: mime,
  });

  const row = await db.projectAttachment.create({
    data: {
      businessId: ctx.business.id,
      projectId,
      uploadedById: ctx.employee.id,
      storageKey: uploaded.storageKey,
      storageUrl: uploaded.storageUrl,
      originalFilename: input.fileName.slice(0, 200),
      mimeType: mime,
      byteSize: input.data.length,
      caption: input.caption?.trim().slice(0, 300) || null,
    },
    include: { uploadedBy: { select: { id: true, name: true } } },
  });
  return serializeAttachment(row);
}

export async function deleteAttachment(ctx: AuthContext, projectId: string, attachmentId: string) {
  if (!hasPermission(ctx, PERMISSIONS.SUBMIT_PROJECT_COMPLETION)) {
    throw new Error(`Missing permission: ${PERMISSIONS.SUBMIT_PROJECT_COMPLETION}`);
  }
  await requireModule(ctx, "PROJECT_COMPLETION");
  const project = await getProjectOrThrow(ctx.business.id, projectId);

  const attachment = await db.projectAttachment.findFirst({
    where: {
      id: attachmentId,
      projectId,
      businessId: ctx.business.id,
      deletedAt: null,
    },
  });
  if (!attachment) throw new Error("Attachment not found");
  if (!canDeleteAttachment(project.status, Boolean(attachment.submissionId))) {
    throw new Error("Attachments can only be removed before submission");
  }

  try {
    await deleteBlob(attachment.storageUrl);
  } catch {
    // Soft-delete even if remote delete fails so the UI stays consistent.
  }

  await db.projectAttachment.update({
    where: { id: attachment.id },
    data: { deletedAt: new Date() },
  });
  return { success: true };
}

async function resolveSupervisor(
  businessId: string,
  defaultSupervisorId: string | null,
  preferredId?: string | null
) {
  const id = preferredId || defaultSupervisorId;
  if (id) {
    const employee = await db.employeeProfile.findFirst({
      where: { id, businessId, status: "ACTIVE", deletedAt: null },
      select: { id: true, name: true, email: true },
    });
    if (employee) return employee;
  }

  return db.employeeProfile.findFirst({
    where: {
      businessId,
      status: "ACTIVE",
      deletedAt: null,
      role: {
        OR: [
          { name: { in: ["Owner", "Admin", "Manager"] } },
          {
            permissions: {
              some: { permission: { key: PERMISSIONS.APPROVE_PROJECT_COMPLETION } },
            },
          },
        ],
      },
    },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
}

export async function submitForApproval(
  ctx: AuthContext,
  projectId: string,
  input: { completionNote?: string | null; supervisorId?: string | null } = {}
) {
  if (!hasPermission(ctx, PERMISSIONS.SUBMIT_PROJECT_COMPLETION)) {
    throw new Error(`Missing permission: ${PERMISSIONS.SUBMIT_PROJECT_COMPLETION}`);
  }
  await requireModule(ctx, "PROJECT_COMPLETION");
  const settings = await assertCompletionEnabled(ctx.business.id);
  const project = await getProjectOrThrow(ctx.business.id, projectId);

  if (!canSubmitForApproval(project.status)) {
    throw new Error("This project cannot be submitted for approval in its current status");
  }

  const attachments = await db.projectAttachment.findMany({
    where: {
      businessId: ctx.business.id,
      projectId,
      deletedAt: null,
      submissionId: null,
    },
  });

  const photoCheck = validatePhotoCount(
    attachments.length,
    settings.requireCompletionPhotos,
    settings.minCompletionPhotos
  );
  if (!photoCheck.ok) throw new Error(photoCheck.message);

  const supervisor = await resolveSupervisor(
    ctx.business.id,
    settings.defaultProjectSupervisorId,
    input.supervisorId
  );

  if (settings.requireSupervisorApproval && !supervisor) {
    throw new Error("No supervisor is available to review this submission");
  }

  const isResubmit = project.status === "CHANGES_REQUESTED";

  const result = await db.$transaction(async (tx) => {
    const submission = await tx.projectSubmission.create({
      data: {
        businessId: ctx.business.id,
        projectId,
        submittedById: ctx.employee.id,
        supervisorId: supervisor?.id ?? null,
        status: "PENDING_APPROVAL",
        completionNote: input.completionNote?.trim().slice(0, 2_000) || null,
      },
    });

    if (attachments.length) {
      await tx.projectAttachment.updateMany({
        where: { id: { in: attachments.map((a) => a.id) } },
        data: { submissionId: submission.id },
      });
    }

    await tx.projectApprovalEvent.create({
      data: {
        businessId: ctx.business.id,
        projectId,
        submissionId: submission.id,
        actorId: ctx.employee.id,
        action: isResubmit ? "RESUBMITTED" : "SUBMITTED",
        comment: input.completionNote?.trim().slice(0, 2_000) || null,
      },
    });

    await tx.officeWorkspaceRecord.update({
      where: { id: projectId },
      data: { status: "PENDING_APPROVAL" },
    });

    return submission;
  });

  if (supervisor?.email) {
    await sendMail(
      supervisor.email,
      `Project ready for approval: ${project.title}`,
      [
        `Hi ${supervisor.name},`,
        "",
        `${ctx.employee.name} submitted "${project.title}" for approval.`,
        input.completionNote?.trim() ? `\nNote: ${input.completionNote.trim()}` : "",
        "",
        "Review it in Office → Project approvals.",
      ]
        .filter(Boolean)
        .join("\n")
    ).catch(() => null);
  }

  return {
    id: result.id,
    status: result.status,
    submittedAt: result.submittedAt.toISOString(),
    supervisorId: result.supervisorId,
  };
}

export async function listSubmissions(ctx: AuthContext, projectId: string) {
  await requireModule(ctx, "PROJECT_COMPLETION");
  await assertCompletionEnabled(ctx.business.id);
  await getProjectOrThrow(ctx.business.id, projectId);

  const rows = await db.projectSubmission.findMany({
    where: { businessId: ctx.business.id, projectId },
    include: {
      submittedBy: { select: { id: true, name: true } },
      supervisor: { select: { id: true, name: true } },
      attachments: {
        where: { deletedAt: null },
        include: { uploadedBy: { select: { id: true, name: true } } },
      },
      events: {
        orderBy: { createdAt: "asc" },
        include: { actor: { select: { id: true, name: true } } },
      },
    },
    orderBy: { submittedAt: "desc" },
  });

  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    completionNote: row.completionNote,
    reviewComment: row.reviewComment,
    submittedAt: row.submittedAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    submittedBy: row.submittedBy,
    supervisor: row.supervisor,
    attachments: row.attachments.map(serializeAttachment),
    events: row.events.map((event) => ({
      id: event.id,
      action: event.action,
      comment: event.comment,
      createdAt: event.createdAt.toISOString(),
      actor: event.actor,
    })),
  }));
}

export async function listApprovalQueue(ctx: AuthContext) {
  if (!hasPermission(ctx, PERMISSIONS.APPROVE_PROJECT_COMPLETION)) {
    throw new Error(`Missing permission: ${PERMISSIONS.APPROVE_PROJECT_COMPLETION}`);
  }
  await requireModule(ctx, "PROJECT_COMPLETION");
  await assertCompletionEnabled(ctx.business.id);

  const rows = await db.projectSubmission.findMany({
    where: {
      businessId: ctx.business.id,
      status: "PENDING_APPROVAL",
      OR: [{ supervisorId: ctx.employee.id }, { supervisorId: null }],
    },
    include: {
      project: { select: { id: true, title: true, status: true, summary: true } },
      submittedBy: { select: { id: true, name: true } },
      attachments: {
        where: { deletedAt: null },
        select: { id: true, storageUrl: true, originalFilename: true, mimeType: true },
      },
    },
    orderBy: { submittedAt: "asc" },
  });

  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    completionNote: row.completionNote,
    submittedAt: row.submittedAt.toISOString(),
    project: row.project,
    submittedBy: row.submittedBy,
    photoCount: row.attachments.length,
    attachments: row.attachments,
  }));
}

export async function reviewSubmission(
  ctx: AuthContext,
  submissionId: string,
  input: { action: ReviewAction; comment?: string | null }
) {
  if (!hasPermission(ctx, PERMISSIONS.APPROVE_PROJECT_COMPLETION)) {
    throw new Error(`Missing permission: ${PERMISSIONS.APPROVE_PROJECT_COMPLETION}`);
  }
  await requireModule(ctx, "PROJECT_COMPLETION");
  await assertCompletionEnabled(ctx.business.id);

  if (!["APPROVE", "CHANGES_REQUESTED", "REJECT"].includes(input.action)) {
    throw new Error("Invalid review action");
  }
  if (input.action !== "APPROVE" && !input.comment?.trim()) {
    throw new Error("A comment is required when requesting changes or rejecting");
  }

  const submission = await db.projectSubmission.findFirst({
    where: { id: submissionId, businessId: ctx.business.id },
    include: {
      project: { select: { id: true, title: true, status: true } },
      submittedBy: { select: { id: true, name: true, email: true } },
    },
  });
  if (!submission) throw new Error("Submission not found");
  if (!canReviewSubmission(submission.status)) {
    throw new Error("This submission has already been reviewed");
  }

  const projectStatus = projectStatusAfterReview(input.action);
  const submissionStatus = submissionStatusAfterReview(input.action);
  const eventAction =
    input.action === "APPROVE"
      ? "APPROVED"
      : input.action === "CHANGES_REQUESTED"
        ? "CHANGES_REQUESTED"
        : "REJECTED";

  await db.$transaction(async (tx) => {
    await tx.projectSubmission.update({
      where: { id: submission.id },
      data: {
        status: submissionStatus,
        reviewComment: input.comment?.trim().slice(0, 2_000) || null,
        reviewedAt: new Date(),
        supervisorId: submission.supervisorId ?? ctx.employee.id,
      },
    });
    await tx.officeWorkspaceRecord.update({
      where: { id: submission.projectId },
      data: { status: projectStatus },
    });
    await tx.projectApprovalEvent.create({
      data: {
        businessId: ctx.business.id,
        projectId: submission.projectId,
        submissionId: submission.id,
        actorId: ctx.employee.id,
        action: eventAction,
        comment: input.comment?.trim().slice(0, 2_000) || null,
      },
    });
  });

  if (submission.submittedBy.email) {
    const verb =
      input.action === "APPROVE"
        ? "approved"
        : input.action === "CHANGES_REQUESTED"
          ? "requested changes on"
          : "rejected";
    await sendMail(
      submission.submittedBy.email,
      `Project ${verb}: ${submission.project.title}`,
      [
        `Hi ${submission.submittedBy.name},`,
        "",
        `${ctx.employee.name} ${verb} "${submission.project.title}".`,
        input.comment?.trim() ? `\nComment: ${input.comment.trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    ).catch(() => null);
  }

  return { success: true, projectStatus, submissionStatus };
}

export async function reopenProject(ctx: AuthContext, projectId: string, comment?: string | null) {
  if (!hasPermission(ctx, PERMISSIONS.REOPEN_PROJECT)) {
    throw new Error(`Missing permission: ${PERMISSIONS.REOPEN_PROJECT}`);
  }
  await requireModule(ctx, "PROJECT_COMPLETION");
  const settings = await assertCompletionEnabled(ctx.business.id);
  const project = await getProjectOrThrow(ctx.business.id, projectId);

  if (!canReopenProject(project.status, settings.allowReopenApprovedProjects)) {
    throw new Error("This project cannot be reopened");
  }

  await db.$transaction(async (tx) => {
    await tx.officeWorkspaceRecord.update({
      where: { id: projectId },
      data: { status: "ACTIVE" },
    });
    await tx.projectApprovalEvent.create({
      data: {
        businessId: ctx.business.id,
        projectId,
        actorId: ctx.employee.id,
        action: "REOPENED",
        comment: comment?.trim().slice(0, 2_000) || null,
      },
    });
  });

  return { success: true, status: "ACTIVE" };
}
