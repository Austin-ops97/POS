"use client";

/**
 * Injectable barcode decoding interface for tests (no physical camera required).
 */
export type DecodedBarcode = {
  rawValue: string;
  format?: string;
};

export type BarcodeDecoder = {
  start: (
    video: HTMLVideoElement,
    onDetect: (result: DecodedBarcode) => void,
    stream?: MediaStream
  ) => Promise<void>;
  stop: () => void;
};

declare global {
  interface Window {
    BarcodeDetector?: new (options?: {
      formats?: string[];
    }) => {
      detect: (
        source: ImageBitmapSource
      ) => Promise<Array<{ rawValue: string; format: string }>>;
      getSupportedFormats?: () => Promise<string[]>;
    };
  }
}

const NATIVE_FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "itf",
  "qr_code",
  "data_matrix",
] as const;

export async function createNativeDecoder(): Promise<BarcodeDecoder | null> {
  if (typeof window === "undefined" || !window.BarcodeDetector) return null;

  try {
    const supported =
      typeof window.BarcodeDetector.prototype.getSupportedFormats === "function"
        ? await window.BarcodeDetector.prototype.getSupportedFormats!()
        : [...NATIVE_FORMATS];

    const formats = NATIVE_FORMATS.filter((f) =>
      supported.map((s: string) => s.toLowerCase()).includes(f)
    );
    if (formats.length === 0) return null;

    const detector = new window.BarcodeDetector({ formats: [...formats] });
    let raf = 0;
    let active = false;
    let videoEl: HTMLVideoElement | null = null;

    return {
      async start(video, onDetect) {
        videoEl = video;
        active = true;
        const tick = async () => {
          if (!active || !videoEl) return;
          try {
            if (videoEl.readyState >= 2) {
              const codes = await detector.detect(videoEl);
              if (codes[0]?.rawValue) {
                onDetect({
                  rawValue: codes[0].rawValue,
                  format: codes[0].format,
                });
              }
            }
          } catch {
            /* frame may fail transiently */
          }
          raf = requestAnimationFrame(() => {
            void tick();
          });
        };
        void tick();
      },
      stop() {
        active = false;
        if (raf) cancelAnimationFrame(raf);
        videoEl = null;
      },
    };
  } catch {
    return null;
  }
}

export async function createZXingDecoder(): Promise<BarcodeDecoder> {
  const { BrowserMultiFormatReader } = await import("@zxing/browser");
  const reader = new BrowserMultiFormatReader();
  let controls: { stop: () => void } | null = null;

  return {
    async start(video, onDetect, stream) {
      if (stream) {
        controls = await reader.decodeFromStream(stream, video, (result) => {
          if (result) {
            onDetect({
              rawValue: result.getText(),
              format: result.getBarcodeFormat()?.toString(),
            });
          }
        });
      } else {
        controls = await reader.decodeFromVideoDevice(
          undefined,
          video,
          (result) => {
            if (result) {
              onDetect({
                rawValue: result.getText(),
                format: result.getBarcodeFormat()?.toString(),
              });
            }
          }
        );
      }
    },
    stop() {
      try {
        controls?.stop();
      } catch {
        /* ignore */
      }
      controls = null;
    },
  };
}

export async function createBestDecoder(): Promise<BarcodeDecoder> {
  const native = await createNativeDecoder();
  if (native) return native;
  return createZXingDecoder();
}

export function stopMediaStream(stream: MediaStream | null) {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      /* ignore */
    }
  }
}

export function playScanBeep() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
    osc.stop(ctx.currentTime + 0.13);
    void ctx.resume();
    setTimeout(() => void ctx.close(), 200);
  } catch {
    /* audio not available */
  }
}

export function vibrateScanFeedback() {
  try {
    navigator.vibrate?.(40);
  } catch {
    /* ignore */
  }
}
