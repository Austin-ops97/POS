"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Maximize, Minus, Plus, RotateCcw } from "lucide-react";

type ZoomViewerProps = {
  src: string;
  alt: string;
  kind: "image" | "pdf";
};

export function ZoomViewer({ src, alt, kind }: ZoomViewerProps) {
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [fit, setFit] = useState(true);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const pinch = useRef<{ distance: number; scale: number } | null>(null);
  const lastTap = useRef(0);

  useEffect(() => {
    setScale(1);
    setFit(true);
    setOffset({ x: 0, y: 0 });
  }, [src]);

  function zoomBy(factor: number) {
    setFit(false);
    setScale((current) => Math.min(6, Math.max(0.5, current * factor)));
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch" && pinch.current) return;
    const now = Date.now();
    if (now - lastTap.current < 280) {
      setFit(false);
      setScale((current) => (current > 1.2 ? 1 : 2));
      setOffset({ x: 0, y: 0 });
      lastTap.current = 0;
      return;
    }
    lastTap.current = now;
    drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const touches = event.nativeEvent;
    void touches;
    if (!drag.current || fit) return;
    setOffset({
      x: drag.current.ox + (event.clientX - drag.current.x),
      y: drag.current.oy + (event.clientY - drag.current.y),
    });
  }

  function onPointerUp() {
    drag.current = null;
  }

  function onWheel(event: React.WheelEvent) {
    event.preventDefault();
    zoomBy(event.deltaY > 0 ? 0.9 : 1.1);
  }

  function onTouchMove(event: React.TouchEvent) {
    if (event.touches.length !== 2) {
      pinch.current = null;
      return;
    }
    event.preventDefault();
    const [a, b] = [event.touches[0], event.touches[1]];
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    if (!pinch.current) {
      pinch.current = { distance, scale };
      return;
    }
    const next = pinch.current.scale * (distance / pinch.current.distance);
    setFit(false);
    setScale(Math.min(6, Math.max(0.5, next)));
  }

  const transform = `translate(${fit ? 0 : offset.x}px, ${fit ? 0 : offset.y}px)`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => zoomBy(1.25)} aria-label="Zoom in">
          <Plus className="h-4 w-4" />
          Zoom in
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => zoomBy(0.8)} aria-label="Zoom out">
          <Minus className="h-4 w-4" />
          Zoom out
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setFit(true);
            setScale(1);
            setOffset({ x: 0, y: 0 });
          }}
        >
          <Maximize className="h-4 w-4" />
          Fit
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setFit(false);
            setScale(1);
            setOffset({ x: 0, y: 0 });
          }}
        >
          <RotateCcw className="h-4 w-4" />
          100%
        </Button>
      </div>
      <div
        ref={frame}
        className="relative h-[65vh] overflow-hidden rounded-xl bg-slate-100 touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onTouchMove={onTouchMove}
        onTouchEnd={() => {
          pinch.current = null;
        }}
      >
        <div
          className="flex h-full w-full items-center justify-center"
          style={{ transform, transformOrigin: "center center" }}
        >
          {kind === "pdf" ? (
            <iframe
              title={alt}
              src={src}
              className="bg-white"
              style={fit ? { width: "100%", height: "100%" } : { width: `${scale * 100}%`, height: `${scale * 100}%` }}
            />
          ) : (
            // Authenticated receipt bytes cannot use the Next image optimizer.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt={alt}
              draggable={false}
              className={fit ? "max-h-full max-w-full object-contain" : "max-w-none"}
              style={fit ? undefined : { transform: `scale(${scale})` }}
            />
          )}
        </div>
      </div>
      <p className="text-xs text-slate-500">Drag to pan. Scroll or pinch to zoom. Double-tap switches between fit and 200%.</p>
    </div>
  );
}
