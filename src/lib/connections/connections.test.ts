import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createConversationSchema, createMessageSchema, reactionSchema } from "./validation";

describe("employee connections validation", () => {
  it("accepts a direct conversation with exactly one teammate", () => {
    const value = createConversationSchema.parse({ type: "DIRECT", memberIds: ["employee-2"] });
    assert.deepEqual(value.memberIds, ["employee-2"]);
  });

  it("requires a named group with at least two teammates", () => {
    assert.equal(createConversationSchema.safeParse({ type: "GROUP", memberIds: ["employee-2"] }).success, false);
    assert.equal(createConversationSchema.safeParse({ type: "GROUP", name: "Store team", memberIds: ["2", "3"] }).success, true);
  });

  it("bounds message content and reactions", () => {
    assert.equal(createMessageSchema.safeParse({ body: "" }).success, false);
    assert.equal(createMessageSchema.safeParse({ body: "Hello team" }).success, true);
    assert.equal(reactionSchema.safeParse({ emoji: "✅" }).success, true);
    assert.equal(reactionSchema.safeParse({ emoji: "unsafe" }).success, false);
  });
});
