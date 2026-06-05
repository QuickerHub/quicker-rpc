"use client";

import { useEffect, useRef } from "react";
import { isLauncherTransparentShell } from "@/lib/launcher/launcher-shell-init";
import { isLauncherHitTarget } from "@/lib/launcher/launcher-hit-target";
import { isTauriShell } from "@/lib/tauri-shell";

const POLL_MS = 32;

async function clientPointFromGlobalCursor(): Promise<{ x: number; y: number } | null> {
  const { getCurrentWindow, cursorPosition } = await import("@tauri-apps/api/window");
  const win = getCurrentWindow();
  const [cursor, inner, scale] = await Promise.all([
    cursorPosition(),
    win.innerPosition(),
    win.scaleFactor(),
  ]);
  return {
    x: (cursor.x - inner.x) / scale,
    y: (cursor.y - inner.y) / scale,
  };
}

function isInsideViewport(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x <= window.innerWidth && y <= window.innerHeight;
}

/**
 * Tauri transparent launcher: pass mouse events through visually empty regions.
 * CSS pointer-events helps; setIgnoreCursorEvents + cursor polling handles Windows WebView2.
 */
export function useLauncherClickThrough(): void {
  const draggingRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isTauriShell() || !isLauncherTransparentShell()) return;

    let disposed = false;
    let ignoring = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let win: import("@tauri-apps/api/window").Window | null = null;

    let onPointerMove: ((event: PointerEvent) => void) | null = null;
    let onPointerDown: ((event: PointerEvent) => void) | null = null;
    let onPointerUp: (() => void) | null = null;

    const stopPoll = () => {
      if (pollTimer != null) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    void (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      if (disposed) return;

      win = getCurrentWindow();
      if (win.label !== "launcher") return;

      const applyAt = async (clientX: number, clientY: number) => {
        if (!win || disposed) return;

        if (draggingRef.current) {
          if (ignoring) {
            ignoring = false;
            await win.setIgnoreCursorEvents(false);
            stopPoll();
          }
          return;
        }

        if (!isInsideViewport(clientX, clientY)) {
          if (ignoring) {
            ignoring = false;
            await win.setIgnoreCursorEvents(false);
            stopPoll();
          }
          return;
        }

        const target = document.elementFromPoint(clientX, clientY);
        const shouldIgnore = !isLauncherHitTarget(target);
        if (shouldIgnore === ignoring) return;

        ignoring = shouldIgnore;
        await win.setIgnoreCursorEvents(shouldIgnore);

        if (shouldIgnore) {
          if (pollTimer == null) {
            pollTimer = setInterval(() => {
              void (async () => {
                const point = await clientPointFromGlobalCursor();
                if (!point || disposed) return;
                await applyAt(point.x, point.y);
              })();
            }, POLL_MS);
          }
        } else {
          stopPoll();
        }
      };

      onPointerMove = (event: PointerEvent) => {
        if (ignoring) return;
        void applyAt(event.clientX, event.clientY);
      };

      onPointerDown = (event: PointerEvent) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest(".titlebar-drag-region")) {
          draggingRef.current = true;
        }
      };

      onPointerUp = () => {
        draggingRef.current = false;
      };

      await win.setIgnoreCursorEvents(false);
      ignoring = false;

      window.addEventListener("pointermove", onPointerMove, { passive: true });
      window.addEventListener("pointerdown", onPointerDown, { passive: true });
      window.addEventListener("pointerup", onPointerUp, { passive: true });
      window.addEventListener("pointercancel", onPointerUp, { passive: true });

      const initial = await clientPointFromGlobalCursor();
      if (initial) {
        await applyAt(initial.x, initial.y);
      }
    })();

    return () => {
      disposed = true;
      stopPoll();
      draggingRef.current = false;
      if (onPointerMove) {
        window.removeEventListener("pointermove", onPointerMove);
      }
      if (onPointerDown) {
        window.removeEventListener("pointerdown", onPointerDown);
      }
      if (onPointerUp) {
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerUp);
      }
      void win?.setIgnoreCursorEvents(false);
    };
  }, []);
}
