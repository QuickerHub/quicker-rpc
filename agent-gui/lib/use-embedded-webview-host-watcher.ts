"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import {
  collectEmbeddedWebViewResizeTargets,
  measureEmbeddedWebViewHostLayout,
  WORKSPACE_LAYOUT_RESIZE_EVENT,
} from "@/lib/embedded-webview-bounds";
import {
  postEmbeddedWebViewBoundsRefresh,
  type EmbeddedWebViewBoundsRefreshReason,
} from "@/lib/embedded-webview-bounds-channel";

const RESIZE_DRAG_BODY_CLASSES = [
  "workspace-explorer-resizing",
  "workspace-explorer-pane-resizing",
] as const;

function isLayoutDragActive(): boolean {
  return RESIZE_DRAG_BODY_CLASSES.some((className) =>
    document.body.classList.contains(className),
  );
}

type UseEmbeddedWebViewHostWatcherOptions = {
  hostRef: RefObject<HTMLElement | null>;
  enabled: boolean;
};

/**
 * Watch the HTML host region under the native child webview and post bounds refresh
 * messages when layout changes (side-panel drag, window resize, flex reflow, …).
 */
export function useEmbeddedWebViewHostWatcher({
  hostRef,
  enabled,
}: UseEmbeddedWebViewHostWatcherOptions): void {
  const lastHostBoundsKeyRef = useRef<string | null>(null);
  const resizeLoopRafRef = useRef<number | null>(null);
  const boundsBurstRafRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (!enabled) return;

    const host = hostRef.current;
    if (!host) return;

    const notify = (
      reason: EmbeddedWebViewBoundsRefreshReason,
      force = false,
    ) => {
      const currentHost = hostRef.current;
      if (!currentHost) return;

      const layout = measureEmbeddedWebViewHostLayout(currentHost);
      const layoutKey = [
        layout.left,
        layout.top,
        layout.width,
        layout.height,
      ].join(",");
      if (!force && layoutKey === lastHostBoundsKeyRef.current) return;
      lastHostBoundsKeyRef.current = layoutKey;

      postEmbeddedWebViewBoundsRefresh({
        layout,
        force: true,
        reason,
      });
    };

    const stopResizeLoop = () => {
      if (resizeLoopRafRef.current == null) return;
      window.cancelAnimationFrame(resizeLoopRafRef.current);
      resizeLoopRafRef.current = null;
    };

    const startResizeLoop = () => {
      if (resizeLoopRafRef.current != null) return;
      const tick = () => {
        notify("layout-drag", true);
        if (isLayoutDragActive()) {
          resizeLoopRafRef.current = window.requestAnimationFrame(tick);
          return;
        }
        resizeLoopRafRef.current = null;
      };
      resizeLoopRafRef.current = window.requestAnimationFrame(tick);
    };

    const stopBoundsBurst = () => {
      if (boundsBurstRafRef.current == null) return;
      window.cancelAnimationFrame(boundsBurstRafRef.current);
      boundsBurstRafRef.current = null;
    };

    const startBoundsBurst = (frames = 48, reason: EmbeddedWebViewBoundsRefreshReason) => {
      stopBoundsBurst();
      lastHostBoundsKeyRef.current = null;
      let remaining = frames;
      const tick = () => {
        notify(reason, true);
        remaining -= 1;
        if (remaining > 0) {
          boundsBurstRafRef.current = window.requestAnimationFrame(tick);
          return;
        }
        boundsBurstRafRef.current = null;
      };
      boundsBurstRafRef.current = window.requestAnimationFrame(tick);
    };

    const onHostResize = () => notify("host-resize", true);
    const hostObserver = new ResizeObserver(onHostResize);
    hostObserver.observe(host, { box: "border-box" });

    const ancestorObserver = new ResizeObserver(() => {
      notify("ancestor-resize", true);
    });
    for (const target of collectEmbeddedWebViewResizeTargets(host)) {
      if (target === host) continue;
      ancestorObserver.observe(target, { box: "border-box" });
    }

    const onWindowResize = () => startBoundsBurst(48, "window-resize");
    const onWorkspaceLayout = () => startBoundsBurst(60, "workspace-layout");

    const shellRoot =
      host.closest<HTMLElement>(".app-shell")
      ?? document.querySelector<HTMLElement>(".app-shell");
    const shellObserver = shellRoot
      ? new MutationObserver(() => startBoundsBurst(24, "shell-layout"))
      : null;
    shellObserver?.observe(shellRoot!, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    const htmlObserver = new MutationObserver(() => {
      startBoundsBurst(24, "shell-layout");
    });
    htmlObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    const bodyObserver = new MutationObserver(() => {
      if (isLayoutDragActive()) {
        startResizeLoop();
        return;
      }
      stopResizeLoop();
      notify("layout-drag", true);
    });
    bodyObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });

    if (isLayoutDragActive()) {
      startResizeLoop();
    }

    window.addEventListener("resize", onWindowResize);
    window.addEventListener(WORKSPACE_LAYOUT_RESIZE_EVENT, onWorkspaceLayout);
    notify("manual", true);

    let unlistenWindowResize: (() => void) | undefined;
    let unlistenWindowScale: (() => void) | undefined;
    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const appWindow = getCurrentWindow();
        unlistenWindowResize = await appWindow.onResized(() => {
          startBoundsBurst(60, "window-resize");
        });
        unlistenWindowScale = await appWindow.onScaleChanged(() => {
          startBoundsBurst(60, "window-resize");
        });
      } catch {
        // ignore
      }
    })();

    return () => {
      hostObserver.disconnect();
      ancestorObserver.disconnect();
      shellObserver?.disconnect();
      htmlObserver.disconnect();
      bodyObserver.disconnect();
      stopResizeLoop();
      stopBoundsBurst();
      window.removeEventListener("resize", onWindowResize);
      window.removeEventListener(WORKSPACE_LAYOUT_RESIZE_EVENT, onWorkspaceLayout);
      unlistenWindowResize?.();
      unlistenWindowScale?.();
      lastHostBoundsKeyRef.current = null;
    };
  }, [enabled, hostRef]);
}
