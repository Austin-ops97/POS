import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emptyTaskData,
  isFinishedTask,
  shouldNotifyTaskAssignee,
  splitTaskRecords,
  validateTaskCompletion,
} from "./task-assignments";

describe("task assignment notifications", () => {
  it("notifies the assignee on create, but not the person who assigned it to themselves", () => {
    assert.equal(
      shouldNotifyTaskAssignee({
        workspace: "task-assignments",
        actorId: "manager",
        assigneeId: "scott",
        isCreate: true,
      }),
      true
    );
    assert.equal(
      shouldNotifyTaskAssignee({
        workspace: "task-assignments",
        actorId: "scott",
        assigneeId: "scott",
        isCreate: true,
      }),
      false
    );
  });

  it("notifies only when a task is reassigned to someone else", () => {
    assert.equal(
      shouldNotifyTaskAssignee({
        workspace: "task-assignments",
        actorId: "manager",
        assigneeId: "scott",
        previousAssigneeId: "alex",
        isCreate: false,
      }),
      true
    );
    assert.equal(
      shouldNotifyTaskAssignee({
        workspace: "task-assignments",
        actorId: "manager",
        assigneeId: "scott",
        previousAssigneeId: "scott",
        isCreate: false,
      }),
      false
    );
    assert.equal(
      shouldNotifyTaskAssignee({
        workspace: "projects",
        actorId: "manager",
        assigneeId: "scott",
        isCreate: true,
      }),
      false
    );
  });
});

describe("task completion verification", () => {
  it("requires a confirmation and every checklist item", () => {
    assert.equal(
      validateTaskCompletion({ confirmed: false, checklist: ["Sweep"], checkedItems: ["Sweep"] }),
      "Confirm that you finished all the work asked"
    );
    assert.equal(
      validateTaskCompletion({ confirmed: true, checklist: ["Sweep", "Restock"], checkedItems: ["Sweep"] }),
      "Check off every item you were asked to complete"
    );
    assert.equal(
      validateTaskCompletion({
        confirmed: true,
        checklist: ["Sweep", "Restock"],
        checkedItems: ["Sweep", "Restock"],
      }),
      null
    );
  });
});

describe("open vs finished tasks", () => {
  it("moves completed work out of the open list", () => {
    const openTask = { status: "ACTIVE", data: emptyTaskData() };
    const finishedByFlag = { status: "ACTIVE", data: { ...emptyTaskData(), done: true } };
    const finishedByStatus = { status: "COMPLETE", data: emptyTaskData() };
    assert.equal(isFinishedTask(openTask), false);
    assert.equal(isFinishedTask(finishedByFlag), true);
    const split = splitTaskRecords([openTask, finishedByFlag, finishedByStatus]);
    assert.equal(split.open.length, 1);
    assert.equal(split.finished.length, 2);
  });
});
