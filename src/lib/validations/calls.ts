import { z } from "zod";

export const startCallSchema = z.object({
  conversationId: z.string().min(1),
  type: z.enum(["AUDIO", "VIDEO"]).default("VIDEO"),
});

export const answerCallSchema = z.object({
  withVideo: z.boolean().optional().default(true),
});

export const declineCallSchema = z.object({}).optional();

export const endCallSchema = z.object({
  reason: z.string().trim().max(120).optional(),
}).optional();

export const joinTokenSchema = z.object({
  withVideo: z.boolean().optional().default(true),
}).optional();
