import { LiveKitCallProvider } from "./livekit-provider";

export interface CallProvider {
  createRoom(roomName: string): Promise<{ roomId: string }>;
  createParticipantToken(params: {
    roomName: string;
    identity: string;
    name: string;
    canPublish: boolean;
    canSubscribe: boolean;
    ttlSeconds?: number;
  }): Promise<string>;
  /** WebSocket URL for livekit-client Room.connect */
  getClientUrl(): string;
}

export function isCallProviderConfigured(): boolean {
  return Boolean(
    process.env.LIVEKIT_API_KEY?.trim() &&
      process.env.LIVEKIT_API_SECRET?.trim() &&
      process.env.LIVEKIT_URL?.trim()
  );
}

export function getCallProvider(): CallProvider {
  if (!isCallProviderConfigured()) {
    throw new Error(
      "Video calling is not configured. Set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and LIVEKIT_URL."
    );
  }
  return new LiveKitCallProvider({
    apiKey: process.env.LIVEKIT_API_KEY!.trim(),
    apiSecret: process.env.LIVEKIT_API_SECRET!.trim(),
    url: process.env.LIVEKIT_URL!.trim(),
  });
}
