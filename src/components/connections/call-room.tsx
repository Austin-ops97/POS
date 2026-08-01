"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  audioDeviceId?: string;
  videoDeviceId?: string;
  onLeave: () => void;
  onEnd: () => void;
};

type RemoteInfo = {
  identity: string;
  name: string;
};

function formatElapsed(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function LocalVideoPreview({
  track,
  label,
}: {
  track?: MediaStreamTrack;
  label: string;
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
          muted
          className="h-full w-full -scale-x-100 object-cover"
        />
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-slate-300">{label}</div>
      )}
      <span className="absolute bottom-2 left-2 rounded bg-black/50 px-2 py-0.5 text-xs text-white">
        {label}
      </span>
    </div>
  );
}

function RemoteParticipantTile({
  identity,
  name,
  room,
}: {
  identity: string;
  name: string;
  room: import("livekit-client").Room;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [hasVideo, setHasVideo] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function bind() {
      const { Track, ParticipantEvent } = await import("livekit-client");
      if (cancelled) return;
      const participant = room.remoteParticipants.get(identity);
      if (!participant) return;

      const attachTracks = () => {
        const cam = participant.getTrackPublication(Track.Source.Camera);
        const mic = participant.getTrackPublication(Track.Source.Microphone);
        const videoEl = videoRef.current;
        const audioEl = audioRef.current;

        if (cam?.track && videoEl) {
          cam.track.attach(videoEl);
          setHasVideo(true);
        } else {
          setHasVideo(false);
        }
        if (mic?.track && audioEl) {
          mic.track.attach(audioEl);
        }
      };

      attachTracks();
      participant.on(ParticipantEvent.TrackSubscribed, attachTracks);
      participant.on(ParticipantEvent.TrackUnsubscribed, attachTracks);
      participant.on(ParticipantEvent.TrackMuted, attachTracks);
      participant.on(ParticipantEvent.TrackUnmuted, attachTracks);

      return () => {
        participant.off(ParticipantEvent.TrackSubscribed, attachTracks);
        participant.off(ParticipantEvent.TrackUnsubscribed, attachTracks);
        participant.off(ParticipantEvent.TrackMuted, attachTracks);
        participant.off(ParticipantEvent.TrackUnmuted, attachTracks);
        const cam = participant.getTrackPublication(Track.Source.Camera);
        const mic = participant.getTrackPublication(Track.Source.Microphone);
        cam?.track?.detach();
        mic?.track?.detach();
      };
    }

    let cleanup: (() => void) | undefined;
    void bind().then((fn) => {
      cleanup = fn;
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [identity, room]);

  return (
    <div className="relative aspect-video overflow-hidden rounded-lg bg-slate-800">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className={cn("h-full w-full object-cover", !hasVideo && "hidden")}
      />
      {!hasVideo ? (
        <div className="flex h-full items-center justify-center text-sm text-slate-300">{name}</div>
      ) : null}
      <audio ref={audioRef} autoPlay playsInline />
      <span className="absolute bottom-2 left-2 rounded bg-black/50 px-2 py-0.5 text-xs text-white">
        {name}
      </span>
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
  audioDeviceId,
  videoDeviceId,
  onLeave,
  onEnd,
}: CallRoomProps) {
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(withVideo && callType === "VIDEO");
  const [sharing, setSharing] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [error, setError] = useState("");
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [localVideo, setLocalVideo] = useState<MediaStreamTrack | undefined>();
  const [remotes, setRemotes] = useState<RemoteInfo[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [roomReady, setRoomReady] = useState(false);
  const [liveRoom, setLiveRoom] = useState<import("livekit-client").Room | null>(null);
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
    const tiles: RemoteInfo[] = [];
    room.remoteParticipants.forEach((participant) => {
      tiles.push({
        identity: participant.identity,
        name: participant.name || participant.identity,
      });
    });
    setRemotes(tiles);

    const local = room.localParticipant;
    let localVid: MediaStreamTrack | undefined;
    local.trackPublications.forEach((pub) => {
      if (pub.kind === "video" && pub.track && pub.source === "camera") {
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
        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
          audioCaptureDefaults: audioDeviceId ? { deviceId: audioDeviceId } : undefined,
          videoCaptureDefaults: videoDeviceId ? { deviceId: videoDeviceId } : undefined,
        });
        roomRef.current = room;

        const refresh = () => {
          if (!cancelled) syncParticipants(room);
        };

        room.on(RoomEvent.Reconnecting, () => setReconnecting(true));
        room.on(RoomEvent.Reconnected, () => {
          setReconnecting(false);
          refresh();
        });
        room.on(RoomEvent.Disconnected, () => {
          if (!cancelled) setReconnecting(false);
        });
        room.on(RoomEvent.ParticipantConnected, refresh);
        room.on(RoomEvent.ParticipantDisconnected, refresh);
        room.on(RoomEvent.TrackSubscribed, refresh);
        room.on(RoomEvent.TrackUnsubscribed, refresh);
        room.on(RoomEvent.TrackPublished, refresh);
        room.on(RoomEvent.LocalTrackPublished, refresh);
        room.on(RoomEvent.LocalTrackUnpublished, refresh);
        room.on(RoomEvent.TrackMuted, refresh);
        room.on(RoomEvent.TrackUnmuted, refresh);
        room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
          if (!cancelled) setAudioBlocked(!room.canPlaybackAudio);
        });

        await room.connect(url, token, { autoSubscribe: true });
        if (cancelled) {
          await room.disconnect();
          return;
        }

        // Browser autoplay may block remote audio until a gesture — try immediately
        // (join click is still recent) and surface a fallback button if needed.
        try {
          await room.startAudio();
          setAudioBlocked(!room.canPlaybackAudio);
        } catch {
          setAudioBlocked(true);
        }

        await room.localParticipant.setMicrophoneEnabled(true, {
          deviceId: audioDeviceId || undefined,
        });
        if (withVideo && callType === "VIDEO") {
          await room.localParticipant.setCameraEnabled(true, {
            deviceId: videoDeviceId || undefined,
          });
        }

        // Ensure already-present remote tracks are reflected (joiner enters occupied room).
        room.remoteParticipants.forEach((participant) => {
          participant.trackPublications.forEach((pub) => {
            if (pub.track && !pub.isSubscribed) {
              pub.setSubscribed(true);
            }
          });
        });

        syncParticipants(room);
        if (!cancelled) {
          setLiveRoom(room);
          setRoomReady(true);
        }

        // Keep Track kind import used for future-proofing against tree-shaking edge cases
        void Track;
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
      setLiveRoom(null);
      setRoomReady(false);
      void room?.disconnect();
    };
  }, [token, url, withVideo, callType, syncParticipants, audioDeviceId, videoDeviceId]);

  async function enableSound() {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.startAudio();
      setAudioBlocked(!room.canPlaybackAudio);
    } catch {
      setAudioBlocked(true);
    }
  }

  async function toggleMic() {
    const room = roomRef.current;
    if (!room) return;
    const next = !micOn;
    await room.localParticipant.setMicrophoneEnabled(next, {
      deviceId: audioDeviceId || undefined,
    });
    setMicOn(next);
  }

  async function toggleCam() {
    const room = roomRef.current;
    if (!room) return;
    const next = !camOn;
    await room.localParticipant.setCameraEnabled(next, {
      deviceId: videoDeviceId || undefined,
    });
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

  const room = liveRoom;

  return (
    <div
      ref={shellRef}
      className="flex h-full min-h-[28rem] flex-col bg-slate-950 text-white"
      data-call-id={callId}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">
            {callType === "AUDIO" ? "Audio call" : "Video call"}
          </span>
          <span className="font-mono text-xs text-slate-300">{formatElapsed(elapsed)}</span>
          {remotes.length > 0 ? (
            <span className="text-xs text-emerald-300">
              {remotes.length + 1} in call
            </span>
          ) : (
            <span className="text-xs text-slate-400">Waiting for others…</span>
          )}
          {reconnecting ? (
            <span className="animate-pulse text-xs text-amber-300">Reconnecting…</span>
          ) : null}
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-white hover:bg-white/10"
          onClick={toggleFullscreen}
        >
          {fullscreen ? "Exit full screen" : "Full screen"}
        </Button>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-3 overflow-auto p-4 sm:grid-cols-2 lg:grid-cols-3">
        <LocalVideoPreview track={localVideo} label="You" />
        {roomReady && room
          ? remotes.map((remote) => (
              <RemoteParticipantTile
                key={remote.identity}
                identity={remote.identity}
                name={remote.name}
                room={room}
              />
            ))
          : null}
      </div>

      {audioBlocked ? (
        <div className="mx-4 mb-2 flex items-center justify-between gap-3 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          <span>Click to enable sound so you can hear others on the call.</span>
          <Button type="button" size="sm" variant="secondary" onClick={() => void enableSound()}>
            Enable sound
          </Button>
        </div>
      ) : null}

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
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-white/20 text-white"
          onClick={() => void leave()}
        >
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
