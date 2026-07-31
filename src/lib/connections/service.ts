import type { AuthContext } from "@/lib/auth";
import { hasPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import {
  conversationSearchSchema,
  createConversationSchema,
  createMessageSchema,
  reactionSchema,
} from "./validation";

function requireConnectionPermission(ctx: AuthContext, permission: string) {
  if (!hasPermission(ctx, permission)) throw new Error(`Missing permission: ${permission}`);
}

async function requireMembership(ctx: AuthContext, conversationId: string) {
  const member = await db.connectionConversationMember.findFirst({
    where: {
      conversationId,
      employeeId: ctx.employee.id,
      conversation: { businessId: ctx.business.id, deletedAt: null },
    },
  });
  if (!member) throw new Error("Conversation not found");
  return member;
}

export async function ensureEveryoneConversation(ctx: AuthContext) {
  let conversation = await db.connectionConversation.findFirst({
    where: { businessId: ctx.business.id, type: "EVERYONE", deletedAt: null },
  });
  if (!conversation) {
    conversation = await db.connectionConversation.create({
      data: { businessId: ctx.business.id, type: "EVERYONE", name: "Everyone", createdById: ctx.employee.id },
    });
  }
  const employees = await db.employeeProfile.findMany({
    where: { businessId: ctx.business.id, status: "ACTIVE", deletedAt: null },
    select: { id: true },
  });
  await db.connectionConversationMember.createMany({
    data: employees.map((employee) => ({ conversationId: conversation.id, employeeId: employee.id })),
    skipDuplicates: true,
  });
  return conversation;
}

export async function listConnectionEmployees(ctx: AuthContext) {
  requireConnectionPermission(ctx, PERMISSIONS.VIEW_CONNECTIONS);
  return db.employeeProfile.findMany({
    where: { businessId: ctx.business.id, status: "ACTIVE", deletedAt: null },
    select: { id: true, name: true, preferredName: true, jobTitle: true, department: true, profilePhotoUrl: true },
    orderBy: { name: "asc" },
  });
}

export async function listConversations(ctx: AuthContext, input: unknown = {}) {
  requireConnectionPermission(ctx, PERMISSIONS.VIEW_CONNECTIONS);
  await ensureEveryoneConversation(ctx);
  const { q } = conversationSearchSchema.parse(input);
  const rows = await db.connectionConversation.findMany({
    where: {
      businessId: ctx.business.id,
      deletedAt: null,
      members: { some: { employeeId: ctx.employee.id } },
      ...(q ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { members: { some: { employee: { name: { contains: q, mode: "insensitive" as const } } } } },
          { messages: { some: { body: { contains: q, mode: "insensitive" as const }, deletedAt: null } } },
        ],
      } : {}),
    },
    include: {
      members: { include: { employee: { select: { id: true, name: true, preferredName: true, jobTitle: true, profilePhotoUrl: true } } } },
      messages: {
        where: { deletedAt: null },
        include: { sender: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
  });

  return Promise.all(rows.map(async (conversation) => {
    const membership = conversation.members.find((member) => member.employeeId === ctx.employee.id)!;
    const unreadCount = await db.connectionMessage.count({
      where: {
        conversationId: conversation.id,
        deletedAt: null,
        senderId: { not: ctx.employee.id },
        ...(membership.lastReadAt ? { createdAt: { gt: membership.lastReadAt } } : {}),
      },
    });
    const other = conversation.type === "DIRECT"
      ? conversation.members.find((member) => member.employeeId !== ctx.employee.id)?.employee
      : null;
    return {
      id: conversation.id,
      type: conversation.type,
      name: conversation.type === "DIRECT" ? (other?.preferredName || other?.name || "Direct message") : (conversation.name || "Group"),
      members: conversation.members.map((member) => member.employee),
      lastMessage: conversation.messages[0] ?? null,
      unreadCount,
      lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
    };
  }));
}

export async function createConversation(ctx: AuthContext, input: unknown) {
  requireConnectionPermission(ctx, PERMISSIONS.SEND_CONNECTION_MESSAGES);
  const value = createConversationSchema.parse(input);
  const memberIds = [...new Set(value.memberIds)].filter((id) => id !== ctx.employee.id);
  const validMembers = await db.employeeProfile.findMany({
    where: { id: { in: memberIds }, businessId: ctx.business.id, status: "ACTIVE", deletedAt: null },
    select: { id: true },
  });
  if (validMembers.length !== memberIds.length) throw new Error("One or more employees not found");

  if (value.type === "DIRECT") {
    const existing = await db.connectionConversation.findFirst({
      where: {
        businessId: ctx.business.id,
        type: "DIRECT",
        deletedAt: null,
        AND: memberIds.concat(ctx.employee.id).map((employeeId) => ({ members: { some: { employeeId } } })),
      },
      include: { _count: { select: { members: true } } },
    });
    if (existing?._count.members === 2) return existing;
  }

  return db.connectionConversation.create({
    data: {
      businessId: ctx.business.id,
      type: value.type,
      name: value.type === "GROUP" ? value.name : null,
      createdById: ctx.employee.id,
      members: {
        create: [ctx.employee.id, ...memberIds].map((employeeId) => ({ employeeId })),
      },
    },
  });
}

export async function listMessages(ctx: AuthContext, conversationId: string) {
  requireConnectionPermission(ctx, PERMISSIONS.VIEW_CONNECTIONS);
  await requireMembership(ctx, conversationId);
  const messages = await db.connectionMessage.findMany({
    where: { conversationId, businessId: ctx.business.id, deletedAt: null },
    include: {
      sender: { select: { id: true, name: true, preferredName: true, profilePhotoUrl: true } },
      replyTo: { select: { id: true, body: true, sender: { select: { name: true } } } },
      reactions: { include: { employee: { select: { id: true, name: true } } } },
    },
    orderBy: { createdAt: "asc" },
    take: 150,
  });
  await markConversationRead(ctx, conversationId);
  return messages;
}

export async function sendMessage(ctx: AuthContext, conversationId: string, input: unknown) {
  requireConnectionPermission(ctx, PERMISSIONS.SEND_CONNECTION_MESSAGES);
  await requireMembership(ctx, conversationId);
  const value = createMessageSchema.parse(input);
  if (value.replyToId) {
    const reply = await db.connectionMessage.findFirst({ where: { id: value.replyToId, conversationId, deletedAt: null } });
    if (!reply) throw new Error("Reply message not found");
  }
  return db.$transaction(async (tx) => {
    const message = await tx.connectionMessage.create({
      data: {
        businessId: ctx.business.id,
        conversationId,
        senderId: ctx.employee.id,
        body: value.body,
        replyToId: value.replyToId || null,
      },
      include: {
        sender: { select: { id: true, name: true, preferredName: true, profilePhotoUrl: true } },
        replyTo: { select: { id: true, body: true, sender: { select: { name: true } } } },
        reactions: { include: { employee: { select: { id: true, name: true } } } },
      },
    });
    await tx.connectionConversation.update({ where: { id: conversationId }, data: { lastMessageAt: message.createdAt } });
    await tx.connectionConversationMember.update({
      where: { conversationId_employeeId: { conversationId, employeeId: ctx.employee.id } },
      data: { lastReadAt: message.createdAt },
    });
    return message;
  });
}

export async function markConversationRead(ctx: AuthContext, conversationId: string) {
  await requireMembership(ctx, conversationId);
  return db.connectionConversationMember.update({
    where: { conversationId_employeeId: { conversationId, employeeId: ctx.employee.id } },
    data: { lastReadAt: new Date() },
  });
}

export async function toggleReaction(ctx: AuthContext, messageId: string, input: unknown) {
  requireConnectionPermission(ctx, PERMISSIONS.SEND_CONNECTION_MESSAGES);
  const { emoji } = reactionSchema.parse(input);
  const message = await db.connectionMessage.findFirst({
    where: { id: messageId, businessId: ctx.business.id, deletedAt: null },
    select: { conversationId: true },
  });
  if (!message) throw new Error("Message not found");
  await requireMembership(ctx, message.conversationId);
  const key = { messageId_employeeId_emoji: { messageId, employeeId: ctx.employee.id, emoji } };
  const existing = await db.connectionMessageReaction.findUnique({ where: key });
  if (existing) {
    await db.connectionMessageReaction.delete({ where: key });
    return { active: false };
  }
  await db.connectionMessageReaction.create({ data: { messageId, employeeId: ctx.employee.id, emoji } });
  return { active: true };
}
