/**
 * Pure helpers for project completion validation (exported for tests).
 */

export const PROJECT_COMPLETION_STATUSES = [
  "ACTIVE",
  "PENDING_APPROVAL",
  "CHANGES_REQUESTED",
  "APPROVED",
  "COMPLETE",
  "REJECTED",
] as const;

export type ProjectCompletionStatus = (typeof PROJECT_COMPLETION_STATUSES)[number];

export const REVIEW_ACTIONS = ["APPROVE", "CHANGES_REQUESTED", "REJECT"] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

export function validatePhotoCount(photoCount: number, requirePhotos: boolean, minPhotos: number) {
  if (!requirePhotos) return { ok: true as const };
  const min = Math.max(1, minPhotos || 1);
  if (photoCount < min) {
    return {
      ok: false as const,
      message: `At least ${min} completion photo${min === 1 ? "" : "s"} required`,
    };
  }
  return { ok: true as const };
}

export function canSubmitForApproval(status: string) {
  return status === "ACTIVE" || status === "CHANGES_REQUESTED" || status === "REJECTED";
}

export function canUploadAttachments(status: string) {
  return status === "ACTIVE" || status === "CHANGES_REQUESTED" || status === "REJECTED";
}

export function canDeleteAttachment(status: string, linkedToSubmission: boolean) {
  return !linkedToSubmission && canUploadAttachments(status);
}

export function canReviewSubmission(submissionStatus: string) {
  return submissionStatus === "PENDING_APPROVAL";
}

export function projectStatusAfterReview(action: ReviewAction): ProjectCompletionStatus {
  switch (action) {
    case "APPROVE":
      return "COMPLETE";
    case "CHANGES_REQUESTED":
      return "CHANGES_REQUESTED";
    case "REJECT":
      return "REJECTED";
  }
}

export function submissionStatusAfterReview(action: ReviewAction): string {
  switch (action) {
    case "APPROVE":
      return "APPROVED";
    case "CHANGES_REQUESTED":
      return "CHANGES_REQUESTED";
    case "REJECT":
      return "REJECTED";
  }
}

export function canReopenProject(status: string, allowReopen: boolean) {
  if (!allowReopen) return false;
  return status === "COMPLETE" || status === "APPROVED" || status === "REJECTED";
}
