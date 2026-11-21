import { createHash, randomBytes } from "crypto";
import type { AuthContext } from "@/lib/auth";
import { hasPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import { officeContentText } from "@/lib/office/content";
import { isReceiptEmailConfigured } from "@/lib/receipts/receipt-email";
import { Resend } from "resend";
import { renderSignedEsignPdf } from "./esign-pdf";
import { publicAppOrigin } from "@/lib/app-origin";

function requireEsign(ctx: AuthContext) {
  if (!hasPermission(ctx, PERMISSIONS.CREATE_DOCUMENTS) && !hasPermission(ctx, PERMISSIONS.EDIT_DOCUMENTS)) {
    throw new Error(`Missing permission: ${PERMISSIONS.CREATE_DOCUMENTS}`);
  }
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function appOrigin(requestOrigin?: string | null) {
  return publicAppOrigin(requestOrigin);
}

function serialize(request: {
  id: string;
  kind: string;
  title: string;
  body: string;
  signerName: string;
  signerEmail: string;
  status: string;
  sentAt: Date;
  viewedAt: Date | null;
  signedAt: Date | null;
  signerIp: string | null;
  signerUserAgent: string | null;
  signatureKind: string | null;
  contentSha256: string | null;
  documentId: string | null;
  customerId: string | null;
  createdAt: Date;
  events?: Array<{ id: string; type: string; ipAddress: string | null; userAgent: string | null; createdAt: Date }>;
}) {
  return {
    ...request,
    sentAt: request.sentAt.toISOString(),
    viewedAt: request.viewedAt?.toISOString() ?? null,
    signedAt: request.signedAt?.toISOString() ?? null,
    createdAt: request.createdAt.toISOString(),
    events: request.events?.map((event) => ({
      ...event,
      createdAt: event.createdAt.toISOString(),
    })),
  };
}

async function sendSignEmail(input: {
  to: string;
  signerName: string;
  title: string;
  businessName: string;
  link: string;
}) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RECEIPTS_FROM_EMAIL?.trim() || process.env.OFFICE_FROM_EMAIL?.trim();
  if (!apiKey || !from) {
    return { skipped: true as const };
  }
  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from,
    to: input.to,
    subject: `Please sign: ${input.title}`,
    text: `${input.signerName},\n\n${input.businessName} sent you a document to sign: ${input.title}\n\n${input.link}\n`,
    html: `<p>${input.signerName},</p><p>${input.businessName} sent you a document to sign: <strong>${input.title}</strong></p><p><a href="${input.link}">Review and sign</a></p>`,
  });
  if (result.error) throw new Error(result.error.message);
  return { skipped: false as const };
}

export async function listEsignRequests(ctx: AuthContext) {
  if (!hasPermission(ctx, PERMISSIONS.VIEW_DOCUMENTS)) {
    throw new Error(`Missing permission: ${PERMISSIONS.VIEW_DOCUMENTS}`);
  }
  const rows = await db.officeEsignRequest.findMany({
    where: { businessId: ctx.business.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map(serialize);
}

export async function createAndSendEsign(ctx: AuthContext, input: {
  title: string;
  kind: "QUOTE" | "CONTRACT" | "WORK_AUTHORIZATION" | "OTHER";
  body?: string;
  documentId?: string | null;
  customerId?: string | null;
  signerName: string;
  signerEmail: string;
  requestOrigin?: string | null;
}) {
  requireEsign(ctx);
  const title = input.title.trim();
  const signerName = input.signerName.trim();
  const signerEmail = input.signerEmail.trim().toLowerCase();
  if (!title || !signerName || !signerEmail.includes("@")) {
    throw new Error("Title, signer name, and a valid email are required");
  }
  let body = (input.body ?? "").trim();
  if (input.documentId) {
    const document = await db.officeDocument.findFirst({
      where: { id: input.documentId, businessId: ctx.business.id, deletedAt: null },
      select: { id: true, title: true, content: true },
    });
    if (!document) throw new Error("Document not found");
    if (!body) body = officeContentText(document.content);
  }
  if (input.customerId) {
    const customer = await db.customer.findFirst({
      where: { id: input.customerId, businessId: ctx.business.id, deletedAt: null },
      select: { id: true },
    });
    if (!customer) throw new Error("Customer not found");
  }

  const token = randomBytes(32).toString("hex");
  const created = await db.officeEsignRequest.create({
    data: {
      businessId: ctx.business.id,
      createdById: ctx.employee.id,
      documentId: input.documentId || null,
      customerId: input.customerId || null,
      kind: input.kind,
      title,
      body,
      signerName,
      signerEmail,
      tokenHash: hashToken(token),
      status: "SENT",
      events: { create: { type: "SENT", ipAddress: null, userAgent: null } },
    },
  });
  const link = `${appOrigin(input.requestOrigin)}/sign/${token}`;
  const emailed = await sendSignEmail({
    to: signerEmail,
    signerName,
    title,
    businessName: ctx.business.name,
    link,
  });
  return {
    ...serialize(created),
    signUrl: link,
    emailConfigured: isReceiptEmailConfigured(),
    emailSent: !emailed.skipped,
  };
}

export async function getEsignRequest(ctx: AuthContext, id: string) {
  if (!hasPermission(ctx, PERMISSIONS.VIEW_DOCUMENTS)) {
    throw new Error(`Missing permission: ${PERMISSIONS.VIEW_DOCUMENTS}`);
  }
  const row = await db.officeEsignRequest.findFirst({
    where: { id, businessId: ctx.business.id },
    include: { events: { orderBy: { createdAt: "asc" } } },
  });
  if (!row) throw new Error("Signature request not found");
  return serialize(row);
}

export async function getSignedPdf(ctx: AuthContext, id: string) {
  if (!hasPermission(ctx, PERMISSIONS.VIEW_DOCUMENTS)) {
    throw new Error(`Missing permission: ${PERMISSIONS.VIEW_DOCUMENTS}`);
  }
  const row = await db.officeEsignRequest.findFirst({
    where: { id, businessId: ctx.business.id },
    select: { title: true, signedPdf: true, status: true },
  });
  if (!row?.signedPdf) throw new Error("Signed PDF is not available");
  return row;
}

function findByToken(token: string) {
  return db.officeEsignRequest.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { business: { select: { name: true, legalName: true } } },
  });
}

export async function publicEsignView(token: string, ip?: string, userAgent?: string) {
  const row = await findByToken(token);
  if (!row) return null;
  if (row.status === "SENT") {
    await db.officeEsignRequest.update({
      where: { id: row.id },
      data: {
        status: "VIEWED",
        viewedAt: new Date(),
        events: { create: { type: "VIEWED", ipAddress: ip ?? null, userAgent: userAgent ?? null } },
      },
    });
  }
  return {
    title: row.title,
    kind: row.kind,
    body: row.body,
    signerName: row.signerName,
    signerEmail: row.signerEmail,
    status: row.status === "SENT" ? "VIEWED" : row.status,
    businessName: row.business.legalName || row.business.name,
    signed: row.status === "SIGNED",
  };
}

export async function publicEsignSign(input: {
  token: string;
  signatureKind: "DRAW" | "TYPE";
  signatureData: string;
  signerName: string;
  ip?: string;
  userAgent?: string;
}) {
  const row = await findByToken(input.token);
  if (!row) throw new Error("This signing link is not valid");
  if (row.status === "SIGNED") throw new Error("This document is already signed");
  const signatureData = input.signatureData.trim();
  if (!signatureData) throw new Error("Add a signature");
  if (input.signatureKind === "TYPE" && signatureData.length < 2) throw new Error("Type your name to sign");
  if (input.signatureKind === "DRAW" && !signatureData.startsWith("data:image")) {
    throw new Error("Draw your signature");
  }
  const signedAt = new Date();
  const { pdf, sha256 } = await renderSignedEsignPdf({
    title: row.title,
    kind: row.kind,
    body: row.body,
    signerName: input.signerName.trim() || row.signerName,
    signerEmail: row.signerEmail,
    signedAt: signedAt.toISOString(),
    signerIp: input.ip ?? null,
    userAgent: input.userAgent ?? null,
    signatureKind: input.signatureKind,
    signatureData,
    businessName: row.business.legalName || row.business.name,
  });
  await db.officeEsignRequest.update({
    where: { id: row.id },
    data: {
      status: "SIGNED",
      signedAt,
      viewedAt: row.viewedAt ?? signedAt,
      signerName: input.signerName.trim() || row.signerName,
      signerIp: input.ip ?? null,
      signerUserAgent: input.userAgent ?? null,
      signatureKind: input.signatureKind,
      signatureData,
      signedPdf: pdf,
      contentSha256: sha256,
      events: { create: { type: "SIGNED", ipAddress: input.ip ?? null, userAgent: input.userAgent ?? null } },
    },
  });
  return { ok: true };
}
