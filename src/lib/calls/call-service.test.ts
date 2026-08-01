import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
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
  CALL_SYSTEM_PREFIX,
  DEFAULT_RING_TIMEOUT_MS,
} from "./call-helpers";
import { toLiveKitHttpUrl, toLiveKitWsUrl } from "./livekit-provider";
import { startCallSchema, answerCallSchema } from "@/lib/validations/calls";

describe("call room naming", () => {
  it("builds a deterministic-prefix room name with a nonce", () => {
    const a = buildProviderRoomName("biz_abcdefghijk", "conv_opqrstuvwx");
    const b = buildProviderRoomName("biz_abcdefghijk", "conv_opqrstuvwx");
    assert.match(a, /^nx_biz_abcdefgh_conv_opqrstu_[a-f0-9]{12}$/);
    assert.notEqual(a, b);
  });
});

describe("call duration formatting", () => {
  it("formats sub-minute, singular, and plural durations", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    assert.equal(formatCallDuration(start, new Date("2026-01-01T00:00:40Z")), "less than a minute");
    assert.equal(formatCallDuration(start, new Date("2026-01-01T00:01:05Z")), "1 minute");
    assert.equal(formatCallDuration(start, new Date("2026-01-01T00:18:00Z")), "18 minutes");
  });
});

describe("authorization predicates", () => {
  it("allows host or moderator to end a call", () => {
    assert.equal(canEndCallAs({ isHost: true, canModerate: false }), true);
    assert.equal(canEndCallAs({ isHost: false, canModerate: true }), true);
    assert.equal(canEndCallAs({ isHost: false, canModerate: false }), false);
  });

  it("treats GROUP and EVERYONE as group-call conversations", () => {
    assert.equal(isGroupOrEveryoneConversation("DIRECT"), false);
    assert.equal(isGroupOrEveryoneConversation("GROUP"), true);
    assert.equal(isGroupOrEveryoneConversation("EVERYONE"), true);
  });

  it("recognizes joinable call statuses", () => {
    assert.equal(isCallJoinableStatus("RINGING"), true);
    assert.equal(isCallJoinableStatus("ACTIVE"), true);
    assert.equal(isCallJoinableStatus("ENDED"), false);
    assert.equal(isCallJoinableStatus("MISSED"), false);
  });

  it("lets invitees join ACTIVE calls and blocks declined/missed", () => {
    assert.equal(isParticipantJoinable("RINGING"), true);
    assert.equal(isParticipantJoinable("INVITED"), true);
    assert.equal(isParticipantJoinable("JOINED"), true);
    assert.equal(isParticipantJoinable("LEFT"), true);
    assert.equal(isParticipantJoinable("DECLINED"), false);
    assert.equal(isParticipantJoinable("MISSED"), false);
    assert.equal(isAwaitingInviteeResponse("RINGING"), true);
    assert.equal(isAwaitingInviteeResponse("JOINED"), false);

    assert.equal(
      canEmployeeJoinCall({
        callStatus: "ACTIVE",
        employeeId: "emp-2",
        participants: [
          { employeeId: "emp-1", status: "JOINED" },
          { employeeId: "emp-2", status: "RINGING" },
        ],
      }),
      true
    );
    assert.equal(
      canEmployeeJoinCall({
        callStatus: "ACTIVE",
        employeeId: "emp-2",
        participants: [
          { employeeId: "emp-1", status: "JOINED" },
          { employeeId: "emp-2", status: "DECLINED" },
        ],
      }),
      false
    );
    assert.equal(
      canEmployeeJoinCall({
        callStatus: "ENDED",
        employeeId: "emp-2",
        participants: [{ employeeId: "emp-2", status: "RINGING" }],
      }),
      false
    );
  });
});

describe("cross-tenant denial", () => {
  it("throws Call not found when business ids differ", () => {
    assert.throws(() => assertCallTenant("biz-a", "biz-b"), /Call not found/);
    assert.doesNotThrow(() => assertCallTenant("biz-a", "biz-a"));
  });
});

describe("ring timeout helper", () => {
  it("detects when ringing has timed out", () => {
    const ringingAt = new Date("2026-01-01T00:00:00Z");
    assert.equal(
      ringingHasTimedOut(ringingAt, new Date("2026-01-01T00:00:30Z"), DEFAULT_RING_TIMEOUT_MS),
      false
    );
    assert.equal(
      ringingHasTimedOut(ringingAt, new Date("2026-01-01T00:00:45Z"), DEFAULT_RING_TIMEOUT_MS),
      true
    );
    assert.equal(ringingHasTimedOut(null), false);
  });
});

describe("system call message markers", () => {
  it("prefixes and detects call timeline messages", () => {
    const body = callSystemBody("Austin started a video call");
    assert.equal(body.startsWith(CALL_SYSTEM_PREFIX), true);
    assert.equal(isCallSystemMessage(body), true);
    assert.equal(stripCallSystemPrefix(body), "Austin started a video call");
    assert.equal(isCallSystemMessage("Hello"), false);
  });
});

describe("LiveKit URL normalization", () => {
  it("converts websocket and http schemes", () => {
    assert.equal(toLiveKitHttpUrl("wss://example.livekit.cloud"), "https://example.livekit.cloud");
    assert.equal(toLiveKitWsUrl("https://example.livekit.cloud"), "wss://example.livekit.cloud");
    assert.equal(toLiveKitHttpUrl("https://example.livekit.cloud/"), "https://example.livekit.cloud");
  });
});

describe("call validation schemas", () => {
  it("accepts start and answer payloads", () => {
    assert.equal(startCallSchema.safeParse({ conversationId: "c1", type: "VIDEO" }).success, true);
    assert.equal(startCallSchema.safeParse({ conversationId: "c1", type: "AUDIO" }).success, true);
    assert.equal(startCallSchema.safeParse({ type: "VIDEO" }).success, false);
    assert.equal(answerCallSchema.parse({ withVideo: false }).withVideo, false);
  });
});
