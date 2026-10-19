import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canDeleteAttachment,
  canReopenProject,
  canReviewSubmission,
  canSubmitForApproval,
  canUploadAttachments,
  PENDING_APPROVAL_STATUS,
  projectApprovalQueueWhere,
  projectStatusAfterReview,
  submissionStatusAfterReview,
  submissionVisibleInApprovalQueue,
  validatePhotoCount,
} from "./completion-helpers";

describe("completion validation helpers", () => {
  it("enforces minimum photo count when required", () => {
    assert.equal(validatePhotoCount(0, false, 3).ok, true);
    assert.equal(validatePhotoCount(0, true, 1).ok, false);
    assert.equal(validatePhotoCount(2, true, 3).ok, false);
    assert.equal(validatePhotoCount(3, true, 3).ok, true);
  });

  it("allows submit only from editable statuses", () => {
    assert.equal(canSubmitForApproval("ACTIVE"), true);
    assert.equal(canSubmitForApproval("CHANGES_REQUESTED"), true);
    assert.equal(canSubmitForApproval("REJECTED"), true);
    assert.equal(canSubmitForApproval("PENDING_APPROVAL"), false);
    assert.equal(canSubmitForApproval("COMPLETE"), false);
  });

  it("blocks attachment edits after submit", () => {
    assert.equal(canUploadAttachments("ACTIVE"), true);
    assert.equal(canUploadAttachments("PENDING_APPROVAL"), false);
    assert.equal(canDeleteAttachment("ACTIVE", false), true);
    assert.equal(canDeleteAttachment("ACTIVE", true), false);
    assert.equal(canDeleteAttachment("PENDING_APPROVAL", false), false);
  });

  it("maps review actions to project and submission statuses", () => {
    assert.equal(projectStatusAfterReview("APPROVE"), "COMPLETE");
    assert.equal(projectStatusAfterReview("CHANGES_REQUESTED"), "CHANGES_REQUESTED");
    assert.equal(projectStatusAfterReview("REJECT"), "REJECTED");
    assert.equal(submissionStatusAfterReview("APPROVE"), "APPROVED");
    assert.equal(submissionStatusAfterReview("CHANGES_REQUESTED"), "CHANGES_REQUESTED");
    assert.equal(submissionStatusAfterReview("REJECT"), "REJECTED");
  });

  it("gates review and reopen transitions", () => {
    assert.equal(canReviewSubmission("PENDING_APPROVAL"), true);
    assert.equal(canReviewSubmission("APPROVED"), false);
    assert.equal(canReopenProject("COMPLETE", true), true);
    assert.equal(canReopenProject("APPROVED", true), true);
    assert.equal(canReopenProject("REJECTED", true), true);
    assert.equal(canReopenProject("COMPLETE", false), false);
    assert.equal(canReopenProject("ACTIVE", true), false);
  });

  it("shows pending submissions to every approver in the business", () => {
    const where = projectApprovalQueueWhere("biz_1");
    assert.deepEqual(where, { businessId: "biz_1", status: PENDING_APPROVAL_STATUS });
    assert.equal("supervisorId" in where, false);
    assert.equal("OR" in where, false);

    const assignedToSomeoneElse = {
      businessId: "biz_1",
      status: PENDING_APPROVAL_STATUS,
      supervisorId: "emp_other",
    };
    assert.equal(submissionVisibleInApprovalQueue(assignedToSomeoneElse, "biz_1"), true);
    assert.equal(
      submissionVisibleInApprovalQueue({ ...assignedToSomeoneElse, supervisorId: null }, "biz_1"),
      true
    );
    assert.equal(
      submissionVisibleInApprovalQueue({ ...assignedToSomeoneElse, supervisorId: "emp_viewer" }, "biz_1"),
      true
    );
    assert.equal(
      submissionVisibleInApprovalQueue({ ...assignedToSomeoneElse, businessId: "biz_2" }, "biz_1"),
      false
    );
    assert.equal(
      submissionVisibleInApprovalQueue({ ...assignedToSomeoneElse, status: "APPROVED" }, "biz_1"),
      false
    );
    assert.equal(
      submissionVisibleInApprovalQueue({ ...assignedToSomeoneElse, status: "REJECTED" }, "biz_1"),
      false
    );
    assert.equal(
      submissionVisibleInApprovalQueue({ ...assignedToSomeoneElse, status: "CHANGES_REQUESTED" }, "biz_1"),
      false
    );
  });
});
