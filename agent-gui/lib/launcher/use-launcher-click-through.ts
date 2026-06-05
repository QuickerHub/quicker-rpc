"use client";

import { useEffect, useRef } from "react";
import { isLauncherTransparentShell } from "@/lib/launcher/launcher-shell-init";
import { isLauncherHitTarget } from "@/lib/launcher/launcher-hit-target";
import {
  LAUNCHER_HIDDEN_EVENT,
  LAUNCHER_SHOWN_EVENT,
} from "@/lib/launcher/launcher-tauri-events";
import { isTauriShell } from "@/lib/tauri-shell";

const POLL_MS = 32;
/** Do not enable click-through immediately after focus — lets the user click the composer. */
const CLICK_THROUGH_GRACE_MS = 350;

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
 * Only active while the launcher window is focused, and never during the post-show grace period.
 */
export function useLauncherClickThrough(): void {
  const draggingRef = useRef(false);
  const focusSinceRef = useRef(0);

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
    let unlistenFocus: (() => void) | null = null;
    let unlistenShown: (() => void) | null = null;
    let unlistenHidden: (() => void) | null = null;

    const stopPoll = () => {
      if (pollTimer != null) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const resetInteraction = async () => {
      focusSinceRef.current = Date.now();
      ignoring = false;
      stopPoll();
      if (win) {
        await win.setIgnoreCursorEvents(false);
      }
    };

    void (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const { listen } = await import("@tauri-apps/api/event");
      if (disposed) return;

      win = getCurrentWindow();
      if (win.label !== "launcher") return;

      await resetInteraction();

      unlistenFocus = await win.onFocusChanged(({ payload: focused }) => {
        if (focused) {
          void resetInteraction();
        } else {
          ignoring = false;
          stopPoll();
        }
      });

      unlistenShown = await listen(LAUNCHER_SHOWN_EVENT, () => {
        void resetInteraction();
      });

      unlistenHidden = await listen(LAUNCHER_HIDDEN_EVENT, () => {
        void resetInteraction();
      });

      const applyAt = async (clientX: number, clientY: number) => {
        if (!win || disposed) return;

        if (draggingRef.current) {
          if (ignoring) {
            await resetInteraction();
          }
          return;
        }

        const focused = await win.isFocused();
        if (!focused || !document.hasFocus()) {
          if (ignoring) {
            await resetInteraction();
          }
          return;
        }

        if (Date.now() - focusSinceRef.current < CLICK_THROUGH_GRACE_MS) {
          if (ignoring) {
            await resetInteraction();
          }
          return;
        }

        if (!isInsideViewport(clientX, clientY)) {
          if (ignoring) {
            await resetInteraction();
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

      window.addEventListener("pointermove", onPointerMove, { passive: true });
      window.addEventListener("pointerdown", onPointerDown, { passive: true });
      window.addEventListener("pointerup", onPointerUp, { passive: true });
      window.addEventListener("pointercancel", onPointerUp, { passive: true });
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
      unlistenFocus?.();
      unlistenShown?.();
      unlistenHidden?.();
      void win?.setIgnoreCursorEvents(false);
    };
  }, []);
}
