"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Camera, Flashlight, Keyboard, SwitchCamera, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createBestDecoder,
  playScanBeep,
  stopMediaStream,
  vibrateScanFeedback,
  type BarcodeDecoder,
  type DecodedBarcode,
} from "./decoder";

export type BarcodeScannerProps = {
  open: boolean;
  onClose: () => void;
  onScan: (result: DecodedBarcode) => void;
  /** Prevent re-processing the same code (ms). Default 1500. */
  cooldownMs?: number;
  /** Keep scanning after each successful read (inventory modes). */
  continuous?: boolean;
  title?: string;
  /** Inject decoder for tests. */
  decoderFactory?: () => Promise<BarcodeDecoder>;
};

type ScannerState =
  | "loading"
  | "ready"
  | "permission_denied"
  | "error"
  | "manual";

export function BarcodeScanner({
  open,
  onClose,
  onScan,
  cooldownMs = 1500,
  continuous = true,
  title = "Scan barcode",
  decoderFactory = createBestDecoder,
}: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const decoderRef = useRef<BarcodeDecoder | null>(null);
  const lastCodeRef = useRef<{ value: string; at: number } | null>(null);
  const [state, setState] = useState<ScannerState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [flashOn, setFlashOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | undefined>();
  const [manualValue, setManualValue] = useState("");
  const [flashHit, setFlashHit] = useState(false);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const cleanup = useCallback(() => {
    decoderRef.current?.stop();
    decoderRef.current = null;
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setFlashOn(false);
  }, []);

  const handleDetect = useCallback(
    (result: DecodedBarcode) => {
      const now = Date.now();
      const last = lastCodeRef.current;
      if (
        last &&
        last.value === result.rawValue &&
        now - last.at < cooldownMs
      ) {
        return;
      }
      lastCodeRef.current = { value: result.rawValue, at: now };
      setLastScanned(result.rawValue);
      setFlashHit(true);
      playScanBeep();
      vibrateScanFeedback();
      window.setTimeout(() => setFlashHit(false), 250);
      onScan(result);
      if (!continuous) {
        cleanup();
        onClose();
      }
    },
    [cleanup, continuous, cooldownMs, onClose, onScan]
  );

  const startCamera = useCallback(async () => {
    cleanup();
    setState("loading");
    setErrorMessage(null);

    if (
      typeof window !== "undefined" &&
      window.isSecureContext === false &&
      window.location.hostname !== "localhost"
    ) {
      setState("error");
      setErrorMessage("Camera scanning requires HTTPS outside localhost.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setState("error");
      setErrorMessage("Camera is not available on this device.");
      return;
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId } }
          : {
              facingMode: { ideal: "environment" },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      const videoTrack = stream.getVideoTracks()[0];
      const caps = videoTrack?.getCapabilities?.() as
        | { torch?: boolean }
        | undefined;
      setTorchSupported(Boolean(caps?.torch));

      const video = videoRef.current;
      if (!video) {
        stopMediaStream(stream);
        return;
      }
      video.srcObject = stream;
      await video.play();

      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(all.filter((d) => d.kind === "videoinput"));

      const decoder = await decoderFactory();
      decoderRef.current = decoder;
      await decoder.start(video, handleDetect, stream);
      setState("ready");
    } catch (error) {
      cleanup();
      const name = error instanceof Error ? error.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setState("permission_denied");
      } else {
        setState("error");
        setErrorMessage(
          error instanceof Error ? error.message : "Unable to open camera"
        );
      }
    }
  }, [cleanup, decoderFactory, deviceId, handleDetect]);

  useEffect(() => {
    if (!open) {
      cleanup();
      return;
    }
    void startCamera();
    return () => {
      cleanup();
    };
  }, [open, startCamera, cleanup]);

  useEffect(() => {
    if (!open) return;
    const onVisibility = () => {
      if (document.hidden) cleanup();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [open, cleanup]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !torchSupported) return;
    try {
      const next = !flashOn;
      await track.applyConstraints({
        // @ts-expect-error torch is a non-standard constraint
        advanced: [{ torch: next }],
      });
      setFlashOn(next);
    } catch {
      setTorchSupported(false);
    }
  };

  const switchCamera = () => {
    if (devices.length < 2) return;
    const currentIndex = devices.findIndex((d) => d.deviceId === deviceId);
    const next = devices[(currentIndex + 1) % devices.length];
    setDeviceId(next?.deviceId);
  };

  const submitManual = () => {
    const value = manualValue.trim();
    if (!value) return;
    handleDetect({ rawValue: value, format: "manual" });
    setManualValue("");
    setState("ready");
  };

  if (!open || !mounted) return null;

  const overlay: ReactNode = (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black text-white"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="relative flex items-center justify-between gap-2 px-3 py-2 sm:px-4"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <button
          type="button"
          aria-label="Close scanner"
          className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/10"
          onClick={() => {
            cleanup();
            onClose();
          }}
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
        <h2 className="min-w-0 flex-1 truncate text-center text-sm font-semibold tracking-wide sm:text-base">
          {title}
        </h2>
        <button
          type="button"
          aria-label="Enter barcode manually"
          className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/10"
          onClick={() => setState("manual")}
        >
          <Keyboard className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          playsInline
          muted
          autoPlay
        />

        {/* Darkened overlay with rectangular target */}
        <div className="pointer-events-none absolute inset-0">
          <div
            className={`absolute left-1/2 top-1/2 h-40 w-[78%] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border-2 ${
              flashHit ? "border-emerald-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]" : "border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
            } transition-colors duration-200`}
          />
        </div>

        <p className="absolute bottom-28 left-0 right-0 text-center text-sm text-white/90">
          Center the barcode in the frame
        </p>

        {lastScanned && state === "ready" && (
          <p className="absolute bottom-20 left-0 right-0 text-center font-mono text-xs text-emerald-300">
            {lastScanned}
          </p>
        )}

        {(state === "loading" ||
          state === "permission_denied" ||
          state === "error" ||
          state === "manual") && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6">
            {state === "loading" && (
              <div className="text-center">
                <Camera className="mx-auto mb-3 h-8 w-8 animate-pulse" />
                <p className="text-sm">Starting camera…</p>
              </div>
            )}
            {state === "permission_denied" && (
              <div className="max-w-sm space-y-3 text-center">
                <p className="text-base font-medium">Camera permission needed</p>
                <p className="text-sm text-white/70">
                  Allow camera access in your browser or system settings, then
                  try again. You can also enter a barcode manually.
                </p>
                <div className="flex justify-center gap-2">
                  <Button variant="secondary" onClick={() => void startCamera()}>
                    Retry
                  </Button>
                  <Button variant="outline" onClick={() => setState("manual")}>
                    Enter manually
                  </Button>
                </div>
              </div>
            )}
            {state === "error" && (
              <div className="max-w-sm space-y-3 text-center">
                <p className="text-base font-medium">Camera unavailable</p>
                <p className="text-sm text-white/70">
                  {errorMessage || "Unable to start the camera."}
                </p>
                <div className="flex justify-center gap-2">
                  <Button variant="secondary" onClick={() => void startCamera()}>
                    Retry
                  </Button>
                  <Button variant="outline" onClick={() => setState("manual")}>
                    Enter manually
                  </Button>
                </div>
              </div>
            )}
            {state === "manual" && (
              <div className="w-full max-w-sm space-y-3">
                <p className="text-center text-sm font-medium">Enter barcode</p>
                <input
                  autoFocus
                  className="w-full rounded-md border border-white/20 bg-white/10 px-3 py-3 text-base text-white outline-none"
                  value={manualValue}
                  onChange={(e) => setManualValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitManual();
                  }}
                  placeholder="Type or paste barcode"
                  inputMode="numeric"
                  enterKeyHint="done"
                  autoComplete="off"
                  aria-label="Barcode value"
                />
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={submitManual}>
                    Submit
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setState("ready");
                      void startCamera();
                    }}
                  >
                    Back to camera
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div
        className="flex items-center justify-center gap-8 px-4 py-4"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          disabled={!torchSupported}
          onClick={() => void toggleTorch()}
          aria-label={flashOn ? "Turn flashlight off" : "Turn flashlight on"}
          className="flex min-h-12 min-w-12 flex-col items-center gap-1 text-xs text-white/80 disabled:opacity-30"
        >
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
            <Flashlight className={`h-5 w-5 ${flashOn ? "text-amber-300" : ""}`} aria-hidden="true" />
          </span>
          Flash
        </button>
        <button
          type="button"
          disabled={devices.length < 2}
          onClick={switchCamera}
          aria-label="Switch camera"
          className="flex min-h-12 min-w-12 flex-col items-center gap-1 text-xs text-white/80 disabled:opacity-30"
        >
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
            <SwitchCamera className="h-5 w-5" aria-hidden="true" />
          </span>
          Flip
        </button>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
