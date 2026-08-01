import type { AuthContext } from "@/lib/auth";
import { hasPermission } from "@/lib/auth";
import { requireModule } from "@/lib/access-control";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import { startCallSchema, answerCallSchema } from "@/lib/validations/calls";
import { getCallProvider, isCallProviderConfigured } from "./provider";
import {
  assertCallTenant,
  buildProviderRoomName,
  callSystemBody,
  canEndCallAs,
  formatCallDuration,
  isCallJoinableStatus,
  isGroupOrEveryoneConversation,
  ringingHasTimedOut,
} from "./call-helpers";

export {
  CALL_SYSTEM_PREFIX,
  DEFAULT_RING_TIMEOUT_MS,
  assertCallTenant,
  buildProviderRoomName,
  callSystemBody,
  canEmployeeJoinCall,
  canEndCallAs,
  formatCallDuration,
  isAwaitingInviteeResponse,
  isCallJoinableStatus,
  isCallSystemMessage,
  isGroupOrEveryoneConversation,
  isParticipantJoinable,
  ringingHasTimedOut,
  stripCallSystemPrefix,
} from "./call-helpers";

function requireCallPermission(ctx: AuthContext, permission: string) {
  if (!hasPermission(ctx, permission)) throw new Error(`Missing permission: ${permission}`);
}

function displayName(employee: { preferredName?: string | null; name: string }) {
  return employee.preferredName || employee.name;
}

async function getCallSettings(businessId: string) {
  const settings = await db.businessSetting.findUnique({
    where: { businessId },
    select: {
      enableVideoCalling: true,
      enableGroupCalling: true,
      enableScreenSharing: true,
      enableMissedCallEmails: true,
    },
  });
  return {
    enableVideoCalling: settings?.enableVideoCalling ?? true,
    enableGroupCalling: settings?.enableGroupCalling ?? true,
    enableScreenSharing: settings?.enableScreenSharing ?? true,
    enableMissedCallEmails: settings?.enableMissedCallEmails ?? false,
  };
}

async function postTimelineMessage(
  ctx: AuthContext,
  conversationId: string,
  text: string
) {
  const body = callSystemBody(text);
  await db.$transaction(async (tx) => {
    const message = await tx.connectionMessage.create({
      data: {
        businessId: ctx.business.id,
        conversationId,
        senderId: ctx.employee.id,
        body,
      },
    });
    await tx.connectionConversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: message.createdAt },
    });
  });
}

const callInclude = {
  startedBy: { select: { id: true, name: true, preferredName: true, profilePhotoUrl: true } },
  participants: {
    include: {
      employee: { select: { id: true, name: true, preferredName: true, profilePhotoUrl: true } },
    },
  },
  conversation: { select: { id: true, type: true, name: true } },
} as const;

function serializeCall(call: {
  id: string;
  businessId: string;
  conversationId: string | null;
  type: string;
  status: string;
  provider: string;
  providerRoomId: string;
  ringingAt: Date | null;
  startedAt: Date | null;
  endedAt: Date | null;
  missedAt: Date | null;
  endReason: string | null;
  createdAt: Date;
  startedBy: { id: string; name: string; preferredName: string | null; profilePhotoUrl: string | null };
  participants: Array<{
    id: string;
    employeeId: string;
    status: string;
    withVideo: boolean;
    isHost: boolean;
    joinedAt: Date | null;
    leftAt: Date | null;
    declinedAt: Date | null;
    employee: { id: string; name: string; preferredName: string | null; profilePhotoUrl: string | null };
  }>;
  conversation: { id: string; type: string; name: string | null } | null;
}) {
  return {
    id: call.id,
    businessId: call.businessId,
    conversationId: call.conversationId,
    type: call.type,
    status: call.status,
    provider: call.provider,
    providerRoomId: call.providerRoomId,
    ringingAt: call.ringingAt?.toISOString() ?? null,
    startedAt: call.startedAt?.toISOString() ?? null,
    endedAt: call.endedAt?.toISOString() ?? null,
    missedAt: call.missedAt?.toISOString() ?? null,
    endReason: call.endReason,
    createdAt: call.createdAt.toISOString(),
    startedBy: call.startedBy,
    conversation: call.conversation,
    participants: call.participants.map((p) => ({
      id: p.id,
      employeeId: p.employeeId,
      status: p.status,
      withVideo: p.withVideo,
      isHost: p.isHost,
      joinedAt: p.joinedAt?.toISOString() ?? null,
      leftAt: p.leftAt?.toISOString() ?? null,
      declinedAt: p.declinedAt?.toISOString() ?? null,
      employee: p.employee,
    })),
  };
}

export async function startCall(ctx: AuthContext, input: unknown) {
  await requireModule(ctx, "VIDEO_CALLING");
  requireCallPermission(ctx, PERMISSIONS.START_CONNECTION_CALLS);
  if (!isCallProviderConfigured()) {
    throw new Error(
      "Video calling is not configured. Set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and LIVEKIT_URL."
    );
  }

  const value = startCallSchema.parse(input);
  const settings = await getCallSettings(ctx.business.id);
  if (!settings.enableVideoCalling) {
    throw new Error("Video calling is disabled for this business");
  }

  const conversation = await db.connectionConversation.findFirst({
    where: {
      id: value.conversationId,
      businessId: ctx.business.id,
      deletedAt: null,
      members: { some: { employeeId: ctx.employee.id } },
    },
    include: {
      members: { select: { employeeId: true } },
    },
  });
  if (!conversation) throw new Error("Conversation not found");

  if (isGroupOrEveryoneConversation(conversation.type) && !settings.enableGroupCalling) {
    throw new Error("Group calling is disabled for this business");
  }

  const activeExisting = await db.communicationCall.findFirst({
    where: {
      businessId: ctx.business.id,
      conversationId: conversation.id,
      status: { in: ["CREATED", "RINGING", "ACTIVE"] },
    },
  });
  if (activeExisting) throw new Error("A call is already active in this conversation");

  const provider = getCallProvider();
  const roomName = buildProviderRoomName(ctx.business.id, conversation.id);
  const { roomId } = await provider.createRoom(roomName);

  const now = new Date();
  const call = await db.communicationCall.create({
    data: {
      businessId: ctx.business.id,
      conversationId: conversation.id,
      startedById: ctx.employee.id,
      type: value.type,
      status: "RINGING",
      provider: "livekit",
      providerRoomId: roomId,
      ringingAt: now,
      participants: {
        create: conversation.members.map((member) => ({
          employeeId: member.employeeId,
          status: member.employeeId === ctx.employee.id ? "JOINED" : "RINGING",
          isHost: member.employeeId === ctx.employee.id,
          withVideo: value.type === "VIDEO",
          joinedAt: member.employeeId === ctx.employee.id ? now : null,
        })),
      },
    },
    include: callInclude,
  });

  const callLabel = value.type === "AUDIO" ? "audio call" : "video call";
  await postTimelineMessage(
    ctx,
    conversation.id,
    `${displayName(ctx.employee)} started a ${callLabel}`
  );

  return serializeCall(call);
}

export async function getCall(ctx: AuthContext, callId: string) {
  await requireModule(ctx, "VIDEO_CALLING");
  requireCallPermission(ctx, PERMISSIONS.JOIN_CONNECTION_CALLS);

  const call = await db.communicationCall.findFirst({
    where: { id: callId },
    include: callInclude,
  });
  if (!call) throw new Error("Call not found");
  assertCallTenant(call.businessId, ctx.business.id);

  const isParticipant = call.participants.some((p) => p.employeeId === ctx.employee.id);
  if (!isParticipant && !hasPermission(ctx, PERMISSIONS.MODERATE_CONNECTION_CALLS)) {
    throw new Error("Call not found");
  }

  return serializeCall(call);
}

export async function listActiveForEmployee(ctx: AuthContext) {
  await requireModule(ctx, "VIDEO_CALLING");
  if (
    !hasPermission(ctx, PERMISSIONS.JOIN_CONNECTION_CALLS) &&
    !hasPermission(ctx, PERMISSIONS.START_CONNECTION_CALLS)
  ) {
    return [];
  }

  const calls = await db.communicationCall.findMany({
    where: {
      businessId: ctx.business.id,
      status: { in: ["RINGING", "ACTIVE"] },
      participants: {
        some: {
          employeeId: ctx.employee.id,
          status: { in: ["INVITED", "RINGING", "JOINED"] },
        },
      },
    },
    include: callInclude,
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  // Mark timed-out ringing calls as missed (best-effort during poll)
  const results = [];
  for (const call of calls) {
    if (call.status === "RINGING" && ringingHasTimedOut(call.ringingAt)) {
      const missed = await markMissed(ctx, call.id).catch(() => null);
      if (missed) continue;
    }
    results.push(serializeCall(call));
  }
  return results;
}

export async function answerCall(ctx: AuthContext, callId: string, input: unknown = {}) {
  await requireModule(ctx, "VIDEO_CALLING");
  requireCallPermission(ctx, PERMISSIONS.JOIN_CONNECTION_CALLS);

  const { withVideo } = answerCallSchema.parse(input ?? {});
  const call = await db.communicationCall.findFirst({
    where: { id: callId },
    include: { participants: true },
  });
  if (!call) throw new Error("Call not found");
  assertCallTenant(call.businessId, ctx.business.id);

  if (!isCallJoinableStatus(call.status)) {
    throw new Error("Call is no longer available");
  }

  const participant = call.participants.find((p) => p.employeeId === ctx.employee.id);
  if (!participant) throw new Error("Call not found");
  if (participant.status === "DECLINED") throw new Error("You declined this call");

  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.callParticipant.update({
      where: { id: participant.id },
      data: {
        status: "JOINED",
        joinedAt: participant.joinedAt ?? now,
        withVideo,
      },
    });
    if (call.status !== "ACTIVE") {
      await tx.communicationCall.update({
        where: { id: call.id },
        data: { status: "ACTIVE", startedAt: call.startedAt ?? now },
      });
    }
  });

  const updated = await db.communicationCall.findFirstOrThrow({
    where: { id: call.id },
    include: callInclude,
  });
  return serializeCall(updated);
}

export async function declineCall(ctx: AuthContext, callId: string) {
  await requireModule(ctx, "VIDEO_CALLING");
  requireCallPermission(ctx, PERMISSIONS.JOIN_CONNECTION_CALLS);

  const call = await db.communicationCall.findFirst({
    where: { id: callId },
    include: { participants: true },
  });
  if (!call) throw new Error("Call not found");
  assertCallTenant(call.businessId, ctx.business.id);

  const participant = call.participants.find((p) => p.employeeId === ctx.employee.id);
  if (!participant) throw new Error("Call not found");
  if (participant.isHost) throw new Error("Host cannot decline — end the call instead");

  const now = new Date();
  await db.callParticipant.update({
    where: { id: participant.id },
    data: { status: "DECLINED", declinedAt: now },
  });

  // If no other invitees are still ringing/invited, mark the call declined
  const invitees = call.participants.filter((p) => !p.isHost);
  const remainingRinging = invitees.filter(
    (p) => p.employeeId !== ctx.employee.id && (p.status === "RINGING" || p.status === "INVITED")
  );

  if (
    (call.status === "RINGING" || call.status === "CREATED") &&
    remainingRinging.length === 0
  ) {
    await db.communicationCall.update({
      where: { id: call.id },
      data: { status: "DECLINED", endedAt: now, endReason: "declined" },
    });
    if (call.conversationId) {
      await postTimelineMessage(ctx, call.conversationId, "Call declined");
    }
  }

  const updated = await db.communicationCall.findFirstOrThrow({
    where: { id: call.id },
    include: callInclude,
  });
  return serializeCall(updated);
}

export async function endCall(ctx: AuthContext, callId: string, reason?: string) {
  await requireModule(ctx, "VIDEO_CALLING");

  const call = await db.communicationCall.findFirst({
    where: { id: callId },
    include: { participants: true },
  });
  if (!call) throw new Error("Call not found");
  assertCallTenant(call.businessId, ctx.business.id);

  const participant = call.participants.find((p) => p.employeeId === ctx.employee.id);
  const isHost = participant?.isHost ?? false;
  const canModerate = hasPermission(ctx, PERMISSIONS.MODERATE_CONNECTION_CALLS);
  if (!canEndCallAs({ isHost, canModerate })) {
    throw new Error(`Missing permission: ${PERMISSIONS.MODERATE_CONNECTION_CALLS}`);
  }

  if (["ENDED", "MISSED", "DECLINED", "FAILED"].includes(call.status)) {
    const existing = await db.communicationCall.findFirstOrThrow({
      where: { id: call.id },
      include: callInclude,
    });
    return serializeCall(existing);
  }

  const now = new Date();
  const startedAt = call.startedAt;
  await db.$transaction(async (tx) => {
    await tx.communicationCall.update({
      where: { id: call.id },
      data: {
        status: "ENDED",
        endedAt: now,
        endReason: reason?.slice(0, 120) || "ended",
      },
    });
    await tx.callParticipant.updateMany({
      where: { callId: call.id, status: "JOINED" },
      data: { status: "LEFT", leftAt: now },
    });
  });

  if (call.conversationId) {
    const durationText = startedAt
      ? `Call ended — ${formatCallDuration(startedAt, now)}`
      : "Call ended";
    await postTimelineMessage(ctx, call.conversationId, durationText);
  }

  const updated = await db.communicationCall.findFirstOrThrow({
    where: { id: call.id },
    include: callInclude,
  });
  return serializeCall(updated);
}

export async function markMissed(ctx: AuthContext, callId: string) {
  const call = await db.communicationCall.findFirst({
    where: { id: callId, businessId: ctx.business.id },
    include: { participants: true },
  });
  if (!call) throw new Error("Call not found");
  if (call.status !== "RINGING" && call.status !== "CREATED") {
    return serializeCall(
      await db.communicationCall.findFirstOrThrow({ where: { id: call.id }, include: callInclude })
    );
  }
  if (!ringingHasTimedOut(call.ringingAt)) {
    return serializeCall(
      await db.communicationCall.findFirstOrThrow({ where: { id: call.id }, include: callInclude })
    );
  }

  const now = new Date();

  // Host is marked JOINED as soon as the call is created (prejoin). If anyone is already
  // JOINED — or a token was issued (startedAt) — keep the call alive so other accounts can
  // still join via the active-call UI instead of treating it as a missed ring.
  const someoneJoined = call.participants.some((p) => p.status === "JOINED");
  if (someoneJoined || call.startedAt) {
    await db.communicationCall.update({
      where: { id: call.id },
      data: {
        status: "ACTIVE",
        startedAt: call.startedAt ?? now,
      },
    });
    return serializeCall(
      await db.communicationCall.findFirstOrThrow({ where: { id: call.id }, include: callInclude })
    );
  }

  await db.$transaction(async (tx) => {
    await tx.communicationCall.update({
      where: { id: call.id },
      data: { status: "MISSED", missedAt: now, endedAt: now, endReason: "missed" },
    });
    await tx.callParticipant.updateMany({
      where: {
        callId: call.id,
        status: { in: ["INVITED", "RINGING"] },
      },
      data: { status: "MISSED" },
    });
  });

  if (call.conversationId) {
    await postTimelineMessage(ctx, call.conversationId, "Missed call");
  }

  return serializeCall(
    await db.communicationCall.findFirstOrThrow({ where: { id: call.id }, include: callInclude })
  );
}

export async function issueJoinToken(
  ctx: AuthContext,
  callId: string,
  options?: { withVideo?: boolean }
) {
  await requireModule(ctx, "VIDEO_CALLING");
  requireCallPermission(ctx, PERMISSIONS.JOIN_CONNECTION_CALLS);
  if (!isCallProviderConfigured()) {
    throw new Error(
      "Video calling is not configured. Set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and LIVEKIT_URL."
    );
  }

  const call = await db.communicationCall.findFirst({
    where: { id: callId },
    include: { participants: true },
  });
  if (!call) throw new Error("Call not found");
  assertCallTenant(call.businessId, ctx.business.id);

  if (!isCallJoinableStatus(call.status)) {
    throw new Error("Call is no longer available");
  }

  const participant = call.participants.find((p) => p.employeeId === ctx.employee.id);
  if (!participant) throw new Error("Call not found");
  if (participant.status === "DECLINED" || participant.status === "MISSED") {
    throw new Error("You are not invited to this call");
  }

  const provider = getCallProvider();
  const token = await provider.createParticipantToken({
    roomName: call.providerRoomId,
    identity: ctx.employee.id,
    name: displayName(ctx.employee),
    canPublish: true,
    canSubscribe: true,
  });

  // Ensure participant is marked joined when fetching a token
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.callParticipant.update({
      where: { id: participant.id },
      data: {
        status: "JOINED",
        joinedAt: participant.joinedAt ?? now,
        withVideo: options?.withVideo ?? participant.withVideo,
      },
    });
    if (call.status === "RINGING" || call.status === "CREATED") {
      await tx.communicationCall.update({
        where: { id: call.id },
        data: { status: "ACTIVE", startedAt: call.startedAt ?? now },
      });
    }
  });

  const settings = await getCallSettings(ctx.business.id);

  return {
    token,
    url: provider.getClientUrl(),
    roomName: call.providerRoomId,
    callId: call.id,
    type: call.type,
    withVideo: options?.withVideo ?? participant.withVideo,
    enableScreenSharing: settings.enableScreenSharing,
    isHost: participant.isHost,
  };
}
