"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import { browserPanelDeviceScaleFactor } from "@/lib/browser-panel-display-scale";

type BrowserFrameCanvasProps = {
  src: string;
  className?: string;
  /** Measured for viewport sync and pointer mapping (preview area only). */
  containerRef?: RefObject<HTMLDivElement | null>;
};

/** HiDPI canvas renderer for remote browser screencast frames. */
export function BrowserFrameCanvas({
  src,
  className,
  containerRef,
}: BrowserFrameCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const paint = useCallback(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!host || !canvas || !img || !img.complete || img.naturalWidth <= 0) return;

    const dpr = browserPanelDeviceScaleFactor();
    const rect = host.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.floor(rect.width));
    const cssHeight = Math.max(1, Math.floor(rect.height));

    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    // Cover: fill preview area; viewport is synced to this host so aspect ratio matches.
    const scale = Math.max(
      cssWidth / img.naturalWidth,
      cssHeight / img.naturalHeight,
    );
    const drawWidth = img.naturalWidth * scale;
    const drawHeight = img.naturalHeight * scale;
    const offsetX = (cssWidth - drawWidth) / 2;
    const offsetY = (cssHeight - drawHeight) / 2;
    ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
  }, []);

  useEffect(() => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      imageRef.current = img;
      paint();
    };
    img.src = src;
    return () => {
      imageRef.current = null;
    };
  }, [paint, src]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const ro = new ResizeObserver(() => paint());
    ro.observe(host);
    return () => ro.disconnect();
  }, [paint]);

  const setHostRef = useCallback(
    (node: HTMLDivElement | null) => {
      hostRef.current = node;
      if (containerRef) {
        (containerRef as { current: HTMLDivElement | null }).current = node;
      }
    },
    [containerRef],
  );

  return (
    <div ref={setHostRef} className="embedded-browser__preview-host">
      <canvas ref={canvasRef} className={className} aria-hidden />
    </div>
  );
}
