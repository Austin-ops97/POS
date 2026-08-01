import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import type { CallProvider } from "./provider";

export type LiveKitConfig = {
  apiKey: string;
  apiSecret: string;
  url: string;
};

/** Convert wss://… to https://… for RoomServiceClient. */
export function toLiveKitHttpUrl(url: string): string {
  const trimmed = url.trim().replace(/\/$/, "");
  if (trimmed.startsWith("wss://")) return `https://${trimmed.slice(6)}`;
  if (trimmed.startsWith("ws://")) return `http://${trimmed.slice(5)}`;
  return trimmed;
}

/** Ensure client connect URL uses the websocket scheme. */
export function toLiveKitWsUrl(url: string): string {
  const trimmed = url.trim().replace(/\/$/, "");
  if (trimmed.startsWith("https://")) return `wss://${trimmed.slice(8)}`;
  if (trimmed.startsWith("http://")) return `ws://${trimmed.slice(7)}`;
  return trimmed;
}

export class LiveKitCallProvider implements CallProvider {
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly clientUrl: string;
  private readonly rooms: RoomServiceClient;

  constructor(config: LiveKitConfig) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.clientUrl = toLiveKitWsUrl(config.url);
    this.rooms = new RoomServiceClient(toLiveKitHttpUrl(config.url), this.apiKey, this.apiSecret);
  }

  getClientUrl(): string {
    return this.clientUrl;
  }

  async createRoom(roomName: string): Promise<{ roomId: string }> {
    try {
      await this.rooms.createRoom({
        name: roomName,
        emptyTimeout: 60 * 10,
        departureTimeout: 20,
        maxParticipants: 50,
      });
    } catch {
      // Room may already exist; LiveKit also auto-creates on first join with roomCreate grant.
    }
    return { roomId: roomName };
  }

  async createParticipantToken(params: {
    roomName: string;
    identity: string;
    name: string;
    canPublish: boolean;
    canSubscribe: boolean;
    ttlSeconds?: number;
  }): Promise<string> {
    const at = new AccessToken(this.apiKey, this.apiSecret, {
      identity: params.identity,
      name: params.name,
      ttl: params.ttlSeconds ?? 60 * 60 * 2,
    });
    at.addGrant({
      roomJoin: true,
      room: params.roomName,
      roomCreate: true,
      canPublish: params.canPublish,
      canSubscribe: params.canSubscribe,
      canPublishData: true,
    });
    return at.toJwt();
  }
}
