"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CALL_SYSTEM_PREFIX } from "@/lib/calls/call-markers";
import {
  canEmployeeJoinCall,
  isAwaitingInviteeResponse,
} from "@/lib/calls/call-join";
import { ActiveCallJoinBar } from "./active-call-join-bar";
import { CallPrejoin } from "./call-prejoin";
import { CallRoom } from "./call-room";
import { IncomingCallBanner } from "./incoming-call-banner";

type Employee = {
  id: string;
  name: string;
  preferredName?: string | null;
  jobTitle?: string | null;
};
type Conversation = {
  id: string;
  name: string;
  type: string;
  unreadCount: number;
  lastMessage?: { body: string } | null;
};
type Message = {
  id: string;
  body: string;
  createdAt: string;
  sender: { id: string; name: string; preferredName?: string | null };
};

type ActiveCall = {
  id: string;
  type: "AUDIO" | "VIDEO";
  status: string;
  conversationId: string | null;
  startedAt: string | null;
  startedBy: { id: string; name: string; preferredName?: string | null };
  conversation: { id: string; type: string; name: string | null } | null;
  participants: Array<{
    employeeId: string;
    status: string;
    isHost: boolean;
  }>;
};

type JoinSession = {
  callId: string;
  token: string;
  url: string;
  type: "AUDIO" | "VIDEO";
  withVideo: boolean;
  enableScreenSharing: boolean;
  isHost: boolean;
  startedAt?: string | null;
  audioDeviceId?: string;
  videoDeviceId?: string;
};

export type CallSettingsProps = {
  enableVideoCalling: boolean;
  enableGroupCalling: boolean;
  enableScreenSharing: boolean;
};

function callDisplayName(call: ActiveCall) {
  return call.startedBy.preferredName || call.startedBy.name;
}

export function ConnectionsInbox({
  currentEmployeeId,
  canStartCalls = false,
  canJoinCalls = false,
  canModerateCalls = false,
  callsConfigured = false,
  callSettings = {
    enableVideoCalling: true,
    enableGroupCalling: true,
    enableScreenSharing: true,
  },
}: {
  currentEmployeeId: string;
  canStartCalls?: boolean;
  canJoinCalls?: boolean;
  canModerateCalls?: boolean;
  callsConfigured?: boolean;
  callSettings?: CallSettingsProps;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [showPeople, setShowPeople] = useState(false);
  const [error, setError] = useState("");
  const [incoming, setIncoming] = useState<ActiveCall | null>(null);
  const [joinableCalls, setJoinableCalls] = useState<ActiveCall[]>([]);
  const [prejoin, setPrejoin] = useState<{
    callId: string;
    type: "AUDIO" | "VIDEO";
    withVideo: boolean;
  } | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [session, setSession] = useState<JoinSession | null>(null);
  const [bannerBusy, setBannerBusy] = useState(false);

  const videoFeatureOn =
    callSettings.enableVideoCalling && (canStartCalls || canJoinCalls);

  const loadConversations = useCallback(async () => {
    const response = await fetch("/api/connections/conversations", { cache: "no-store" });
    if (!response.ok) return setError("Could not load conversations");
    const rows = (await response.json()) as Conversation[];
    setConversations(rows);
    setActiveId((current) => current || rows[0]?.id || null);
  }, []);

  const loadMessages = useCallback(async (id: string) => {
    const response = await fetch(`/api/connections/conversations/${id}/messages`, {
      cache: "no-store",
    });
    if (response.ok) setMessages(await response.json());
  }, []);

  const pollActiveCalls = useCallback(async () => {
    if (!videoFeatureOn || !canJoinCalls) return;
    const response = await fetch("/api/connections/calls/active", { cache: "no-store" });
    if (!response.ok) return;
    const calls = (await response.json()) as ActiveCall[];

    const mine = calls.filter((call) =>
      canEmployeeJoinCall({
        callStatus: call.status,
        participants: call.participants,
        employeeId: currentEmployeeId,
      })
    );
    setJoinableCalls(mine);

    const ringing = mine.find(
      (call) =>
        call.status === "RINGING" &&
        call.startedBy.id !== currentEmployeeId &&
        call.participants.some(
          (p) =>
            p.employeeId === currentEmployeeId && isAwaitingInviteeResponse(p.status)
        )
    );

    setIncoming(() => {
      if (session || prejoin) return null;
      return ringing ?? null;
    });
  }, [videoFeatureOn, canJoinCalls, currentEmployeeId, session, prejoin]);

  useEffect(() => {
    void loadConversations();
    void fetch("/api/connections/employees", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then(setEmployees);
  }, [loadConversations]);

  useEffect(() => {
    if (!activeId) return;
    void loadMessages(activeId);
    const timer = window.setInterval(() => void loadMessages(activeId), 5000);
    return () => window.clearInterval(timer);
  }, [activeId, loadMessages]);

  useEffect(() => {
    if (!videoFeatureOn) return;
    void pollActiveCalls();
    const timer = window.setInterval(() => void pollActiveCalls(), 4000);
    return () => window.clearInterval(timer);
  }, [videoFeatureOn, pollActiveCalls]);

  async function startDirect(employee: Employee) {
    const response = await fetch("/api/connections/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "DIRECT", memberIds: [employee.id] }),
    });
    if (!response.ok) return setError("Could not start conversation");
    const conversation = (await response.json()) as { id: string };
    setShowPeople(false);
    await loadConversations();
    setActiveId(conversation.id);
  }

  async function send() {
    const text = body.trim();
    if (!text || !activeId) return;
    setBody("");
    const response = await fetch(`/api/connections/conversations/${activeId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text }),
    });
    if (!response.ok) {
      setBody(text);
      return setError("Message could not be sent");
    }
    const message = (await response.json()) as Message;
    setMessages((current) => [...current, message]);
    void loadConversations();
  }

  function canStartInConversation(conversation: Conversation | undefined) {
    if (!conversation || !canStartCalls || !callSettings.enableVideoCalling) return false;
    if (
      (conversation.type === "GROUP" || conversation.type === "EVERYONE") &&
      !callSettings.enableGroupCalling
    ) {
      return false;
    }
    return true;
  }

  async function startCall(type: "AUDIO" | "VIDEO") {
    if (!activeId) return;
    if (!callsConfigured) {
      setError("Video calling is not configured");
      return;
    }
    setError("");

    // Teams-style: if this conversation already has a live call, join it instead of starting another.
    const existing =
      joinableCalls.find((call) => call.conversationId === activeId) ?? null;
    if (existing) {
      openJoinPrejoin(existing, type === "VIDEO");
      return;
    }

    const response = await fetch("/api/connections/calls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: activeId, type }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (data.code === "CALL_ACTIVE" || /already active/i.test(String(data.error ?? ""))) {
        await pollActiveCalls();
        const activeRes = await fetch("/api/connections/calls/active", { cache: "no-store" });
        if (activeRes.ok) {
          const calls = (await activeRes.json()) as ActiveCall[];
          const live =
            (typeof data.callId === "string"
              ? calls.find((call) => call.id === data.callId)
              : null) ??
            calls.find((call) => call.conversationId === activeId) ??
            null;
          if (live) {
            openJoinPrejoin(live, type === "VIDEO");
            return;
          }
        }
        setError("A call is already active — use Join call to enter it.");
        return;
      }
      setError(
        typeof data.error === "string" ? data.error : "Could not start call"
      );
      return;
    }
    setPrejoin({ callId: data.id, type, withVideo: type === "VIDEO" });
    void loadMessages(activeId);
    void pollActiveCalls();
  }

  function openJoinPrejoin(call: ActiveCall, withVideo: boolean) {
    if (!callsConfigured) {
      setError("Video calling is not configured");
      return;
    }
    setError("");
    setPrejoin({
      callId: call.id,
      type: call.type,
      withVideo: call.type === "VIDEO" ? withVideo : false,
    });
    setIncoming(null);
    if (call.conversationId) setActiveId(call.conversationId);
  }

  async function completeJoin(opts: {
    callId: string;
    type: "AUDIO" | "VIDEO";
    withVideo: boolean;
    audioDeviceId?: string;
    videoDeviceId?: string;
  }) {
    setJoining(true);
    setJoinError("");
    try {
      const answerRes = await fetch(`/api/connections/calls/${opts.callId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ withVideo: opts.withVideo }),
      });
      if (!answerRes.ok) {
        const answerData = await answerRes.json().catch(() => ({}));
        throw new Error(
          typeof answerData.error === "string"
            ? answerData.error
            : "Could not join call"
        );
      }
      const tokenRes = await fetch(`/api/connections/calls/${opts.callId}/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ withVideo: opts.withVideo }),
      });
      const tokenData = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok) {
        throw new Error(
          typeof tokenData.error === "string"
            ? tokenData.error
            : "Could not join call"
        );
      }
      setSession({
        callId: opts.callId,
        token: tokenData.token,
        url: tokenData.url,
        type: opts.type,
        withVideo: opts.withVideo,
        enableScreenSharing: Boolean(tokenData.enableScreenSharing ?? callSettings.enableScreenSharing),
        isHost: Boolean(tokenData.isHost),
        startedAt: null,
        audioDeviceId: opts.audioDeviceId,
        videoDeviceId: opts.videoDeviceId,
      });
      setPrejoin(null);
      setIncoming(null);
      void pollActiveCalls();
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "Could not join call");
    } finally {
      setJoining(false);
    }
  }

  async function handleIncomingAnswer(withVideo: boolean) {
    if (!incoming) return;
    openJoinPrejoin(incoming, withVideo);
  }

  async function handleIncomingDecline() {
    if (!incoming) return;
    setBannerBusy(true);
    try {
      await fetch(`/api/connections/calls/${incoming.id}/decline`, { method: "POST" });
      setIncoming(null);
      void pollActiveCalls();
    } finally {
      setBannerBusy(false);
    }
  }

  async function leaveCall() {
    setSession(null);
    if (activeId) void loadMessages(activeId);
    void pollActiveCalls();
  }

  async function endCall() {
    if (!session) return;
    await fetch(`/api/connections/calls/${session.callId}/end`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    setSession(null);
    if (activeId) void loadMessages(activeId);
    void pollActiveCalls();
  }

  const busyCallIds = useMemo(() => {
    const ids = new Set<string>();
    if (session?.callId) ids.add(session.callId);
    if (prejoin?.callId) ids.add(prejoin.callId);
    return ids;
  }, [session, prejoin]);

  const activeConversationCall = useMemo(() => {
    if (!activeId) return null;
    return (
      joinableCalls.find(
        (call) => call.conversationId === activeId && !busyCallIds.has(call.id)
      ) ?? null
    );
  }, [joinableCalls, activeId, busyCallIds]);

  const activeJoinPrompt = useMemo(() => {
    if (session || prejoin || incoming) return null;
    const awaitingOnActive = joinableCalls.find(
      (call) =>
        call.status === "ACTIVE" &&
        !busyCallIds.has(call.id) &&
        call.participants.some(
          (p) =>
            p.employeeId === currentEmployeeId && isAwaitingInviteeResponse(p.status)
        )
    );
    if (awaitingOnActive) return awaitingOnActive;
    return (
      joinableCalls.find(
        (call) =>
          call.status === "ACTIVE" &&
          call.startedBy.id !== currentEmployeeId &&
          !busyCallIds.has(call.id)
      ) ?? null
    );
  }, [joinableCalls, session, prejoin, incoming, busyCallIds, currentEmployeeId]);

  const joinableConversationIds = useMemo(() => {
    const ids = new Set<string>();
    for (const call of joinableCalls) {
      if (call.conversationId && !busyCallIds.has(call.id)) {
        ids.add(call.conversationId);
      }
    }
    return ids;
  }, [joinableCalls, busyCallIds]);

  function renderMessageBody(message: Message) {
    if (message.body.startsWith(CALL_SYSTEM_PREFIX)) {
      const text = message.body.slice(CALL_SYSTEM_PREFIX.length);
      const isStartedCall =
        /\bstarted an? (audio|video) call\b/i.test(text) && Boolean(activeConversationCall);
      return (
        <div className="mx-auto flex max-w-[90%] flex-col items-center gap-2">
          <div className="rounded-full bg-slate-50 px-3 py-1 text-center text-xs text-slate-500">
            {text}
          </div>
          {isStartedCall && canJoinCalls && !session && !prejoin ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!callsConfigured || bannerBusy}
              onClick={() => {
                if (!activeConversationCall) return;
                openJoinPrejoin(activeConversationCall, activeConversationCall.type === "VIDEO");
              }}
            >
              Join call
            </Button>
          ) : null}
        </div>
      );
    }
    return (
      <div
        className={cn(
          "max-w-[80%] rounded-xl px-3 py-2 text-sm",
          message.sender.id === currentEmployeeId
            ? "ml-auto bg-slate-900 text-white"
            : "bg-slate-100"
        )}
      >
        <p className="mb-1 text-xs font-medium opacity-70">
          {message.sender.preferredName || message.sender.name}
        </p>
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
      </div>
    );
  }

  const active = conversations.find((conversation) => conversation.id === activeId);
  const showCallButtons = canStartInConversation(active) && !activeConversationCall;
  const showJoinButton =
    Boolean(activeConversationCall) && canJoinCalls && !session && !prejoin;

  return (
    <div className="relative grid min-h-[65vh] overflow-hidden rounded-xl border bg-white md:grid-cols-[18rem_1fr]">
      {incoming && canJoinCalls ? (
        <IncomingCallBanner
          call={{
            id: incoming.id,
            type: incoming.type,
            startedByName: callDisplayName(incoming),
            conversationName: incoming.conversation?.name || active?.name,
          }}
          onAnswer={(withVideo) => void handleIncomingAnswer(withVideo)}
          onDecline={() => void handleIncomingDecline()}
          busy={bannerBusy}
        />
      ) : null}

      {!incoming && activeJoinPrompt && canJoinCalls ? (
        <ActiveCallJoinBar
          call={{
            id: activeJoinPrompt.id,
            type: activeJoinPrompt.type,
            status: activeJoinPrompt.status,
            startedByName: callDisplayName(activeJoinPrompt),
            conversationName: activeJoinPrompt.conversation?.name || active?.name,
          }}
          onJoin={(withVideo) => openJoinPrejoin(activeJoinPrompt, withVideo)}
          busy={bannerBusy}
        />
      ) : null}

      {(prejoin || session) && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          {session ? (
            <div className="h-full w-full max-w-5xl overflow-hidden rounded-xl border border-white/10 shadow-2xl">
              <CallRoom
                token={session.token}
                url={session.url}
                callId={session.callId}
                callType={session.type}
                withVideo={session.withVideo}
                enableScreenSharing={session.enableScreenSharing}
                isHost={session.isHost}
                canModerate={canModerateCalls}
                startedAt={session.startedAt}
                audioDeviceId={session.audioDeviceId}
                videoDeviceId={session.videoDeviceId}
                onLeave={() => void leaveCall()}
                onEnd={() => void endCall()}
              />
            </div>
          ) : prejoin ? (
            <CallPrejoin
              callType={prejoin.type}
              joining={joining}
              error={
                !callsConfigured
                  ? "Video calling is not configured"
                  : joinError || undefined
              }
              onCancel={() => {
                setPrejoin(null);
                setJoinError("");
              }}
              onJoin={(opts) => {
                if (!callsConfigured) {
                  setJoinError("Video calling is not configured");
                  return;
                }
                void completeJoin({
                  callId: prejoin.callId,
                  type: prejoin.type,
                  withVideo: opts.withVideo,
                  audioDeviceId: opts.audioDeviceId,
                  videoDeviceId: opts.videoDeviceId,
                });
              }}
            />
          ) : null}
        </div>
      )}

      <aside className="border-b md:border-b-0 md:border-r">
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="font-semibold">Conversations</h2>
          <Button size="sm" variant="outline" onClick={() => setShowPeople((value) => !value)}>
            New
          </Button>
        </div>
        {showPeople ? (
          <div className="border-b p-2">
            <p className="px-2 py-1 text-xs font-medium uppercase text-slate-500">
              Start a direct message
            </p>
            {employees.map((employee) => (
              <button
                key={employee.id}
                onClick={() => void startDirect(employee)}
                className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100"
              >
                <span className="block font-medium">
                  {employee.preferredName || employee.name}
                </span>
                <span className="text-xs text-slate-500">
                  {employee.jobTitle || "Team member"}
                </span>
              </button>
            ))}
          </div>
        ) : null}
        <div className="max-h-72 overflow-y-auto md:max-h-[60vh]">
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              onClick={() => setActiveId(conversation.id)}
              className={cn(
                "block w-full border-b px-4 py-3 text-left",
                activeId === conversation.id ? "bg-slate-100" : "hover:bg-slate-50"
              )}
            >
              <span className="flex justify-between gap-2 font-medium">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{conversation.name}</span>
                  {joinableConversationIds.has(conversation.id) ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                      Live
                    </span>
                  ) : null}
                </span>
                {conversation.unreadCount ? (
                  <span className="rounded-full bg-slate-900 px-2 text-xs leading-5 text-white">
                    {conversation.unreadCount}
                  </span>
                ) : null}
              </span>
              <span className="block truncate text-xs text-slate-500">
                {conversation.lastMessage?.body?.startsWith(CALL_SYSTEM_PREFIX)
                  ? conversation.lastMessage.body.slice(CALL_SYSTEM_PREFIX.length)
                  : conversation.lastMessage?.body || "No messages yet"}
              </span>
            </button>
          ))}
        </div>
      </aside>
      <section className="flex min-h-[32rem] flex-col">
        <div className="flex items-center justify-between gap-2 border-b p-4">
          <h2 className="font-semibold">{active?.name || "Choose a conversation"}</h2>
          {showJoinButton && activeConversationCall ? (
            <div className="flex items-center gap-2">
              <span className="hidden text-xs font-medium text-emerald-700 sm:inline">
                {activeConversationCall.type === "VIDEO"
                  ? "Video call active"
                  : "Audio call active"}
              </span>
              <Button
                size="sm"
                type="button"
                disabled={!callsConfigured || bannerBusy}
                title={callsConfigured ? "Join active call" : "Video calling is not configured"}
                onClick={() =>
                  openJoinPrejoin(
                    activeConversationCall,
                    activeConversationCall.type === "VIDEO"
                  )
                }
              >
                Join call
              </Button>
            </div>
          ) : null}
          {showCallButtons ? (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                type="button"
                onClick={() => void startCall("AUDIO")}
                disabled={!callsConfigured}
                title={callsConfigured ? "Start audio call" : "Video calling is not configured"}
              >
                Audio
              </Button>
              <Button
                size="sm"
                type="button"
                onClick={() => void startCall("VIDEO")}
                disabled={!callsConfigured}
                title={callsConfigured ? "Start video call" : "Video calling is not configured"}
              >
                Video
              </Button>
            </div>
          ) : null}
        </div>
        {!callsConfigured && callSettings.enableVideoCalling && canStartCalls ? (
          <p className="border-b bg-amber-50 px-4 py-2 text-xs text-amber-800">
            Video calling is not configured
          </p>
        ) : null}
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.map((message) => (
            <div key={message.id}>{renderMessageBody(message)}</div>
          ))}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>
        {activeId ? (
          <form
            className="flex gap-2 border-t p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <Input
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={4000}
              placeholder="Write a message…"
              aria-label="Message"
            />
            <Button type="submit" disabled={!body.trim()}>
              Send
            </Button>
          </form>
        ) : null}
      </section>
    </div>
  );
}
