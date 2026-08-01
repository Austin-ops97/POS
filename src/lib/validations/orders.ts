import { z } from "zod";

export const ORDER_TERMINATION_REASONS = [
  "CUSTOMER_CANCELED",
  "DUPLICATE_ORDER",
  "ENTERED_BY_MISTAKE",
  "PAYMENT_ABANDONED",
  "REGISTER_INTERRUPTION",
  "OTHER",
] as const;

export const orderTerminationReasonSchema = z.enum(ORDER_TERMINATION_REASONS);

export const terminateOrderSchema = z
  .object({
    reason: orderTerminationReasonSchema,
    notes: z.string().max(2000).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    const notes = data.notes?.trim() ?? "";
    if (data.reason === "OTHER" && notes.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["notes"],
        message: "Notes are required when reason is Other",
      });
    }
  });

export type TerminateOrderInput = z.infer<typeof terminateOrderSchema>;
