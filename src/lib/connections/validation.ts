import { z } from "zod";

export const createConversationSchema = z.object({
  type: z.enum(["DIRECT", "GROUP"]),
  name: z.string().trim().min(1).max(80).optional(),
  memberIds: z.array(z.string().min(1)).min(1).max(50),
}).superRefine((value, ctx) => {
  const memberIds = new Set(value.memberIds);
  if (value.type === "DIRECT" && memberIds.size !== 1) {
    ctx.addIssue({ code: "custom", path: ["memberIds"], message: "A direct conversation requires one employee" });
  }
  if (value.type === "GROUP" && memberIds.size < 2) {
    ctx.addIssue({ code: "custom", path: ["memberIds"], message: "A group conversation requires at least two employees" });
  }
  if (value.type === "GROUP" && !value.name) {
    ctx.addIssue({ code: "custom", path: ["name"], message: "A group name is required" });
  }
});

export const createMessageSchema = z.object({
  body: z.string().trim().min(1, "Write a message first").max(4000),
  replyToId: z.string().min(1).nullable().optional(),
});

export const reactionSchema = z.object({
  emoji: z.enum(["👍", "❤️", "😂", "🎉", "✅", "👀"]),
});

export const conversationSearchSchema = z.object({
  q: z.string().trim().max(100).optional().default(""),
});
