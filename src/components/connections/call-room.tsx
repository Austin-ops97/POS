"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type RemoteTile = {
  identity: string;
  name: string;
  videoTrack?: MediaStreamTrack;
  audioTrack?: MediaStreamTrack;
};

export type CallRoomProps = {
  token: string;
  url: string;
  callId: string;
  callType: "AUDIO" | "VIDEO";
  withVideo: boolean;
  enableScreenSharing: boolean;
  isHost: boolean;
  canModerate: boolean;
  startedAt?: string | null;
  onLeave: () => void;
  onEnd: () => void;
};

function formatElapsed(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function ParticipantVideo({
  track,
  label,
  muted,
  mirrored,
}: {
  track?: MediaStreamTrack;
  label: string;
  muted?: boolean;
  mirrored?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (track) {
      el.srcObject = new MediaStream([track]);
    } else {
      el.srcObject = null;
    }
  }, [track]);

  return (
    <div className="relative aspect-video overflow-hidden rounded-lg bg-slate-800">
      {track ? (
        <video
          ref={ref}
          autoPlay
          playsInline
          muted={muted}
          className={cn("h-full w-full object-cover", mirrored && "-scale-x-100")}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-slate-300">{label}</div>
      )}
      <span className="absolute bottom-2 left-2 rounded bg-black/50 px-2 py-0.5 text-xs text-white">{label}</span>
    </div>
  );
}

export function CallRoom({
  token,
  url,
  callId,
  callType,
  withVideo,
  enableScreenSharing,
  isHost,
  canModerate,
  startedAt,
  onLeave,
  onEnd,
}: CallRoomProps) {
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(withVideo && callType === "VIDEO");
  const [sharing, setSharing] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [error, setError] = useState("");
  const [localVideo, setLocalVideo] = useState<MediaStreamTrack | undefined>();
  const [remotes, setRemotes] = useState<RemoteTile[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const roomRef = useRef<import("livekit-client").Room | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const origin = startedAt ? new Date(startedAt).getTime() : Date.now();
    const tick = window.setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - origin) / 1000)));
    }, 1000);
    return () => window.clearInterval(tick);
  }, [startedAt]);

  const syncParticipants = useCallback((room: import("livekit-client").Room) => {
    const tiles: RemoteTile[] = [];
    room.remoteParticipants.forEach((participant) => {
      let videoTrack: MediaStreamTrack | undefined;
      let audioTrack: MediaStreamTrack | undefined;
      participant.trackPublications.forEach((pub) => {
        if (!pub.track) return;
        const media = pub.track.mediaStreamTrack;
        if (pub.kind === "video" && pub.source !== "screen_share") videoTrack = media;
        if (pub.kind === "audio") audioTrack = media;
      });
      tiles.push({
        identity: participant.identity,
        name: participant.name || participant.identity,
        videoTrack,
        audioTrack,
      });
    });
    setRemotes(tiles);

    const local = room.localParticipant;
    let localVid: MediaStreamTrack | undefined;
    local.trackPublications.forEach((pub) => {
      if (pub.kind === "video" && pub.track && pub.source !== "screen_share") {
        localVid = pub.track.mediaStreamTrack;
      }
    });
    setLocalVideo(localVid);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function connect() {
      try {
        const { Room, RoomEvent, Track } = await import("livekit-client");
        const room = new Room({ adaptiveStream: true, dynacast: true });
        roomRef.current = room;

        room.on(RoomEvent.Reconnecting, () => setReconnecting(true));
        room.on(RoomEvent.Reconnected, () => setReconnecting(false));
        room.on(RoomEvent.Disconnected, () => {
          if (!cancelled) setReconnecting(false);
        });
        const refresh = () => syncParticipants(room);
        room.on(RoomEvent.ParticipantConnected, refresh);
        room.on(RoomEvent.ParticipantDisconnected, refresh);
        room.on(RoomEvent.TrackSubscribed, refresh);
        room.on(RoomEvent.TrackUnsubscribed, refresh);
        room.on(RoomEvent.LocalTrackPublished, refresh);
        room.on(RoomEvent.LocalTrackUnpublished, refresh);
        room.on(RoomEvent.TrackMuted, refresh);
        room.on(RoomEvent.TrackUnmuted, refresh);

        await room.connect(url, token);
        if (cancelled) {
          await room.disconnect();
          return;
        }

        await room.localParticipant.setMicrophoneEnabled(true);
        if (withVideo && callType === "VIDEO") {
          await room.localParticipant.setCameraEnabled(true);
        }
        // Attach remote audio elements
        room.on(RoomEvent.TrackSubscribed, (track) => {
          if (track.kind === Track.Kind.Audio) {
            const el = track.attach();
            el.dataset.lkAudio = "1";
            document.body.appendChild(el);
          }
        });
        room.on(RoomEvent.TrackUnsubscribed, (track) => {
          track.detach().forEach((el) => el.remove());
        });

        syncParticipants(room);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not join the call");
        }
      }
    }
    void connect();
    return () => {
      cancelled = true;
      const room = roomRef.current;
      roomRef.current = null;
      void room?.disconnect();
      document.querySelectorAll("[data-lk-audio]").forEach((el) => el.remove());
    };
  }, [token, url, withVideo, callType, syncParticipants]);

  async function toggleMic() {
    const room = roomRef.current;
    if (!room) return;
    const next = !micOn;
    await room.localParticipant.setMicrophoneEnabled(next);
    setMicOn(next);
  }

  async function toggleCam() {
    const room = roomRef.current;
    if (!room) return;
    const next = !camOn;
    await room.localParticipant.setCameraEnabled(next);
    setCamOn(next);
  }

  async function toggleShare() {
    const room = roomRef.current;
    if (!room || !enableScreenSharing) return;
    const next = !sharing;
    await room.localParticipant.setScreenShareEnabled(next);
    setSharing(next);
  }

  function toggleFullscreen() {
    const el = shellRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      void el.requestFullscreen();
      setFullscreen(true);
    } else {
      void document.exitFullscreen();
      setFullscreen(false);
    }
  }

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  async function leave() {
    await roomRef.current?.disconnect();
    onLeave();
  }

  async function end() {
    await roomRef.current?.disconnect();
    onEnd();
  }

  return (
    <div
      ref={shellRef}
      className="flex h-full min-h-[28rem] flex-col bg-slate-950 text-white"
      data-call-id={callId}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">{callType === "AUDIO" ? "Audio call" : "Video call"}</span>
          <span className="font-mono text-xs text-slate-300">{formatElapsed(elapsed)}</span>
          {reconnecting ? (
            <span className="animate-pulse text-xs text-amber-300">Reconnecting…</span>
          ) : null}
        </div>
        <Button type="button" size="sm" variant="ghost" className="text-white hover:bg-white/10" onClick={toggleFullscreen}>
          {fullscreen ? "Exit full screen" : "Full screen"}
        </Button>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-3 overflow-auto p-4 sm:grid-cols-2 lg:grid-cols-3">
        <ParticipantVideo track={localVideo} label="You" muted mirrored />
        {remotes.map((remote) => (
          <ParticipantVideo key={remote.identity} track={remote.videoTrack} label={remote.name} />
        ))}
      </div>

      {error ? <p className="px-4 text-sm text-red-300">{error}</p> : null}

      <div className="flex flex-wrap items-center justify-center gap-2 border-t border-white/10 px-4 py-4">
        <Button type="button" variant="secondary" size="sm" onClick={() => void toggleMic()}>
          {micOn ? "Mute" : "Unmute"}
        </Button>
        {callType === "VIDEO" ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => void toggleCam()}>
            {camOn ? "Camera off" : "Camera on"}
          </Button>
        ) : null}
        {enableScreenSharing ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => void toggleShare()}>
            {sharing ? "Stop sharing" : "Share screen"}
          </Button>
        ) : null}
        <Button type="button" variant="outline" size="sm" className="border-white/20 text-white" onClick={() => void leave()}>
          Leave
        </Button>
        {isHost || canModerate ? (
          <Button type="button" variant="destructive" size="sm" onClick={() => void end()}>
            End call
          </Button>
        ) : null}
      </div>
    </div>
  );
}
