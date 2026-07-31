import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { requireAuth, requirePermission } from "@/lib/auth";
import { getClientIp, handleApiError, jsonError } from "@/lib/api-utils";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";

const schema = z.object({
  to: z.string().email(), subject: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(20_000),
  confirmed: z.literal(true), recordId: z.string().cuid().optional(),
});
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]!);

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    await requirePermission(ctx, PERMISSIONS.EDIT_DOCUMENTS);
    const limit = await checkRateLimitAsync(`office:message:send:${ctx.employee.id}`, 10, 60_000);
    if (!limit.ok) return jsonError("Too many messages. Wait a minute and try again.", 429);
    const input = schema.parse(await request.json());
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.OFFICE_FROM_EMAIL?.trim() || process.env.RECEIPTS_FROM_EMAIL?.trim();
    if (!apiKey || !from) return jsonError("Email sending is not configured. Set RESEND_API_KEY and OFFICE_FROM_EMAIL.", 503);
    if (input.recordId) {
      const record = await db.officeWorkspaceRecord.findFirst({ where: { id: input.recordId, workspace: "communication", businessId: ctx.business.id, archivedAt: null }, select: { id: true } });
      if (!record) return jsonError("Draft not found", 404);
    }
    const result = await new Resend(apiKey).emails.send({
      from, to: input.to, subject: input.subject,
      text: input.body,
      html: `<div style="font-family:system-ui,sans-serif;white-space:pre-wrap;line-height:1.6">${escapeHtml(input.body)}</div>`,
    });
    if (result.error) return jsonError(result.error.message, 502);
    await db.officeAuditEvent.create({ data: { businessId: ctx.business.id, actorId: ctx.employee.id, action: "OFFICE_EMAIL_SENT", details: { to: input.to, subject: input.subject, recordId: input.recordId ?? null, messageId: result.data?.id }, ipAddress: getClientIp(request) } });
    return NextResponse.json({ success: true, messageId: result.data?.id });
  } catch (error) {
    if (error instanceof z.ZodError) return jsonError(error.issues[0]?.message ?? "Check the message fields", 400);
    return handleApiError(error, "POST /api/office/messages/send");
  }
}
