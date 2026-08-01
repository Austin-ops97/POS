"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export type CallPrejoinProps = {
  callType: "AUDIO" | "VIDEO";
  onJoin: (opts: { withVideo: boolean; audioDeviceId?: string; videoDeviceId?: string }) => void;
  onCancel: () => void;
  joining?: boolean;
  error?: string;
};

export function CallPrejoin({
  callType,
  onJoin,
  onCancel,
  joining = false,
  error,
}: CallPrejoinProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDeviceId, setAudioDeviceId] = useState("");
  const [videoDeviceId, setVideoDeviceId] = useState("");
  const [withVideo, setWithVideo] = useState(callType === "VIDEO");
  const [micLevel, setMicLevel] = useState(0);
  const [previewError, setPreviewError] = useState("");
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<{ ctx: AudioContext; raf: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function enumerate() {
      try {
        const temp = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: callType === "VIDEO",
        });
        temp.getTracks().forEach((t) => t.stop());
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        const audios = devices.filter((d) => d.kind === "audioinput");
        const videos = devices.filter((d) => d.kind === "videoinput");
        setAudioDevices(audios);
        setVideoDevices(videos);
        setAudioDeviceId(audios[0]?.deviceId ?? "");
        setVideoDeviceId(videos[0]?.deviceId ?? "");
      } catch {
        if (!cancelled) setPreviewError("Could not access microphone or camera");
      }
    }
    void enumerate();
    return () => {
      cancelled = true;
    };
  }, [callType]);

  useEffect(() => {
    let cancelled = false;
    async function startPreview() {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (analyserRef.current) {
        cancelAnimationFrame(analyserRef.current.raf);
        void analyserRef.current.ctx.close();
        analyserRef.current = null;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true,
          video: withVideo
            ? videoDeviceId
              ? { deviceId: { exact: videoDeviceId } }
              : true
            : false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = withVideo ? stream : null;
        }

        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const loop = () => {
          analyser.getByteFrequencyData(data);
          const avg = data.reduce((a, b) => a + b, 0) / data.length;
          setMicLevel(Math.min(100, Math.round((avg / 80) * 100)));
          const raf = requestAnimationFrame(loop);
          analyserRef.current = { ctx: audioCtx, raf };
        };
        analyserRef.current = { ctx: audioCtx, raf: requestAnimationFrame(loop) };
        setPreviewError("");
      } catch {
        if (!cancelled) setPreviewError("Could not start device preview");
      }
    }
    void startPreview();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (analyserRef.current) {
        cancelAnimationFrame(analyserRef.current.raf);
        void analyserRef.current.ctx.close();
        analyserRef.current = null;
      }
    };
  }, [audioDeviceId, videoDeviceId, withVideo]);

  return (
    <div className="flex max-w-md flex-col gap-4 rounded-xl border bg-white p-5 shadow-lg">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">Ready to join?</h3>
        <p className="text-sm text-slate-500">Check your mic and camera before entering the call.</p>
      </div>

      <div className="relative aspect-video overflow-hidden rounded-lg bg-slate-900">
        {withVideo ? (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="h-full w-full -scale-x-100 object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-300">Camera off</div>
        )}
      </div>

      <div className="space-y-2">
        <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">Microphone</label>
        <select
          className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
          value={audioDeviceId}
          onChange={(e) => setAudioDeviceId(e.target.value)}
          aria-label="Microphone"
        >
          {audioDevices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || "Microphone"}
            </option>
          ))}
        </select>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100" aria-label="Microphone level">
          <div className="h-full bg-emerald-500 transition-[width] duration-75" style={{ width: `${micLevel}%` }} />
        </div>
      </div>

      {callType === "VIDEO" ? (
        <div className="space-y-2">
          <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">Camera</label>
          <select
            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
            value={videoDeviceId}
            onChange={(e) => setVideoDeviceId(e.target.value)}
            disabled={!withVideo}
            aria-label="Camera"
          >
            {videoDevices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || "Camera"}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={!withVideo}
              onChange={(e) => setWithVideo(!e.target.checked)}
            />
            Join with camera off
          </label>
        </div>
      ) : null}

      {previewError || error ? <p className="text-sm text-red-600">{error || previewError}</p> : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={joining}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={joining}
          onClick={() =>
            onJoin({
              withVideo: callType === "VIDEO" ? withVideo : false,
              audioDeviceId: audioDeviceId || undefined,
              videoDeviceId: videoDeviceId || undefined,
            })
          }
        >
          {joining ? "Joining…" : "Join call"}
        </Button>
      </div>
    </div>
  );
}
