"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyEmbeddedWebViewBounds,
  boundsRectKey,
  collectEmbeddedWebViewResizeTargets,
  WORKSPACE_LAYOUT_RESIZE_EVENT,
} from "@/lib/embedded-webview-bounds";
import { WORKSPACE_BROWSER_WEBVIEW_LABEL } from "@/lib/embedded-webview-label";
import { subscribeBlockingOverlay } from "@/lib/embedded-webview-overlay";
import { isTauriShell } from "@/lib/tauri-shell";

export type EmbeddedWebViewState = "idle" | "loading" | "ready" | "error";

type UseEmbeddedWebViewOptions = {
  active: boolean;
  url: string;
  reloadKey: number;
};

/** Mount a native Tauri child WebView over the host element (WebView2 on Windows). */
export function useEmbeddedWebView({
  active,
  url,
  reloadKey,
}: UseEmbeddedWebViewOptions) {
  const [state, setState] = useState<EmbeddedWebViewState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [hostElement, setHostElement] = useState<HTMLElement | null>(null);
  const hostRef = useRef<HTMLElement | null>(null);
  const readyRef = useRef(false);
  const lastMountKeyRef = useRef("");
  const busyRef = useRef(false);
  const overlayBlockedRef = useRef(false);
  const syncRafRef = useRef<number | null>(null);
  const syncInFlightRef = useRef(false);
  const syncPendingRef = useRef(false);
  const resizeLoopRafRef = useRef<number | null>(null);
  const boundsBurstRafRef = useRef<number | null>(null);
  const lastSyncedBoundsRef = useRef<string | null>(null);

  const setHostRef = useCallback((node: HTMLElement | null) => {
    hostRef.current = node;
    setHostElement(node);
  }, []);

  const focusMainWindow = useCallback(async () => {
    if (!isTauriShell()) return;
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().setFocus();
    } catch {
      // ignore
    }
  }, []);

  const getWebview = useCallback(async () => {
    if (!isTauriShell()) return null;
    const { Webview } = await import("@tauri-apps/api/webview");
    return Webview.getByLabel(WORKSPACE_BROWSER_WEBVIEW_LABEL);
  }, []);

  const teardownWebview = useCallback(async () => {
    if (!isTauriShell()) return;
    try {
      const webview = await getWebview();
      if (webview) {
        await webview.close();
      }
    } catch {
      // ignore
    }
    await focusMainWindow();
  }, [focusMainWindow, getWebview]);

  const applyWebviewVisibility = useCallback(
    async (webview: NonNullable<Awaited<ReturnType<typeof getWebview>>>) => {
      if (overlayBlockedRef.current) {
        await webview.hide();
        return;
      }
      await webview.show();
    },
    [],
  );

  const syncBounds = useCallback(async () => {
    if (!isTauriShell() || !active || !readyRef.current) return;
    if (syncInFlightRef.current) {
      syncPendingRef.current = true;
      return;
    }

    const host = hostRef.current;
    if (!host) return;

    const rect = host.getBoundingClientRect();
    const rectKey = boundsRectKey(rect);
    if (rectKey === lastSyncedBoundsRef.current) return;

    syncInFlightRef.current = true;
    try {
      const webview = await getWebview();
      if (!webview) return;

      await applyEmbeddedWebViewBounds(webview, host);
      lastSyncedBoundsRef.current = rectKey;
      await applyWebviewVisibility(webview);
    } finally {
      syncInFlightRef.current = false;
      if (syncPendingRef.current) {
        syncPendingRef.current = false;
        void syncBounds();
      }
    }
  }, [active, applyWebviewVisibility, getWebview]);

  const scheduleSyncBounds = useCallback(() => {
    if (syncRafRef.current != null) return;
    syncRafRef.current = window.requestAnimationFrame(() => {
      syncRafRef.current = null;
      void syncBounds();
    });
  }, [syncBounds]);

  const stopResizeLoop = useCallback(() => {
    if (resizeLoopRafRef.current == null) return;
    window.cancelAnimationFrame(resizeLoopRafRef.current);
    resizeLoopRafRef.current = null;
  }, []);

  const startResizeLoop = useCallback(() => {
    if (resizeLoopRafRef.current != null) return;
    const tick = () => {
      scheduleSyncBounds();
      if (document.body.classList.contains("workspace-explorer-resizing")) {
        resizeLoopRafRef.current = window.requestAnimationFrame(tick);
        return;
      }
      resizeLoopRafRef.current = null;
    };
    resizeLoopRafRef.current = window.requestAnimationFrame(tick);
  }, [scheduleSyncBounds]);

  const stopBoundsBurst = useCallback(() => {
    if (boundsBurstRafRef.current == null) return;
    window.cancelAnimationFrame(boundsBurstRafRef.current);
    boundsBurstRafRef.current = null;
  }, []);

  const startBoundsBurst = useCallback(
    (frames = 28) => {
      stopBoundsBurst();
      let remaining = frames;
      const tick = () => {
        scheduleSyncBounds();
        remaining -= 1;
        if (remaining > 0) {
          boundsBurstRafRef.current = window.requestAnimationFrame(tick);
          return;
        }
        boundsBurstRafRef.current = null;
      };
      boundsBurstRafRef.current = window.requestAnimationFrame(tick);
    },
    [scheduleSyncBounds, stopBoundsBurst],
  );

  const mountWebview = useCallback(async () => {
    if (!isTauriShell() || !active || busyRef.current) return;

    const targetUrl = url.trim() || "about:blank";
    if (targetUrl === "about:blank") {
      readyRef.current = false;
      lastMountKeyRef.current = "";
      setState("idle");
      setError(null);
      void teardownWebview();
      return;
    }

    const host = hostRef.current;
    if (!host) return;
    let rect = host.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });
        rect = host.getBoundingClientRect();
        if (rect.width >= 2 && rect.height >= 2) break;
      }
      if (rect.width < 2 || rect.height < 2) {
        setError("浏览器区域尺寸无效，请调整窗口大小后重试。");
        setState("error");
        return;
      }
    }

    const mountKey = `${targetUrl}#${reloadKey}`;
    if (readyRef.current && lastMountKeyRef.current === mountKey) {
      await syncBounds();
      return;
    }

    busyRef.current = true;
    setState("loading");
    setError(null);

    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const { Webview } = await import("@tauri-apps/api/webview");

      const appWindow = getCurrentWindow();

      const existing = await getWebview();
      if (existing) {
        await existing.close();
        readyRef.current = false;
      }

      const webview = new Webview(appWindow, WORKSPACE_BROWSER_WEBVIEW_LABEL, {
        url: targetUrl,
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
        focus: false,
        dragDropEnabled: false,
      });

      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(
          () => reject(new Error("webview create timeout")),
          15_000,
        );
        void webview.once("tauri://created", () => {
          window.clearTimeout(timer);
          resolve();
        });
        void webview.once("tauri://error", (event) => {
          window.clearTimeout(timer);
          const payload = event.payload;
          const detail =
            payload instanceof Error
              ? payload.message
              : typeof payload === "string"
                ? payload
                : payload && typeof payload === "object" && "message" in payload
                  ? String((payload as { message?: unknown }).message)
                  : String(payload ?? "webview create failed");
          reject(new Error(detail));
        });
      });

      // Manual bounds only: auto_resize tracks parent window edges, not side-panel flex layout.
      await webview.setAutoResize(false);
      readyRef.current = true;
      lastMountKeyRef.current = mountKey;
      lastSyncedBoundsRef.current = null;
      setState("ready");
      await syncBounds();
    } catch (err) {
      readyRef.current = false;
      const message = err instanceof Error ? err.message : "WebView 创建失败";
      setError(message);
      setState("error");
    } finally {
      busyRef.current = false;
    }
  }, [active, getWebview, reloadKey, syncBounds, teardownWebview, url]);

  useEffect(() => {
    if (!isTauriShell()) {
      setState("idle");
      return;
    }
    if (!active) {
      readyRef.current = false;
      setState("idle");
      void teardownWebview();
      return;
    }
    void mountWebview();
  }, [active, mountWebview, teardownWebview]);

  useEffect(() => {
    if (!isTauriShell() || !active) return;

    return subscribeBlockingOverlay((blocked) => {
      overlayBlockedRef.current = blocked;
      if (blocked) {
        void (async () => {
          const webview = await getWebview();
          if (webview) await webview.hide();
        })();
        return;
      }
      scheduleSyncBounds();
    });
  }, [active, getWebview, scheduleSyncBounds]);

  useEffect(() => {
    if (!isTauriShell() || !active || !hostElement) return;

    const resizeObserver = new ResizeObserver(() => {
      scheduleSyncBounds();
    });

    for (const target of collectEmbeddedWebViewResizeTargets(hostElement)) {
      resizeObserver.observe(target);
    }

    const onWindowResize = () => startBoundsBurst();
    const onLayoutResize = () => startBoundsBurst();

    const shellRoot =
      hostElement.closest<HTMLElement>(".app-shell")
      ?? document.querySelector<HTMLElement>(".app-shell");
    const shellObserver = shellRoot
      ? new MutationObserver(() => startBoundsBurst(20))
      : null;
    shellObserver?.observe(shellRoot!, {
      attributes: true,
      attributeFilter: ["class"],
    });

    const htmlObserver = new MutationObserver(() => startBoundsBurst(20));
    htmlObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    const bodyObserver = new MutationObserver(() => {
      if (document.body.classList.contains("workspace-explorer-resizing")) {
        startResizeLoop();
        return;
      }
      stopResizeLoop();
      scheduleSyncBounds();
    });
    bodyObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });

    if (document.body.classList.contains("workspace-explorer-resizing")) {
      startResizeLoop();
    }

    window.addEventListener("resize", onWindowResize);
    window.addEventListener(WORKSPACE_LAYOUT_RESIZE_EVENT, onLayoutResize);
    scheduleSyncBounds();

    let unlistenWindowResize: (() => void) | undefined;
    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        unlistenWindowResize = await getCurrentWindow().onResized(() => {
          startBoundsBurst();
        });
      } catch {
        // ignore
      }
    })();

    return () => {
      resizeObserver.disconnect();
      shellObserver?.disconnect();
      htmlObserver.disconnect();
      bodyObserver.disconnect();
      stopResizeLoop();
      stopBoundsBurst();
      window.removeEventListener("resize", onWindowResize);
      window.removeEventListener(WORKSPACE_LAYOUT_RESIZE_EVENT, onLayoutResize);
      unlistenWindowResize?.();
      if (syncRafRef.current != null) {
        window.cancelAnimationFrame(syncRafRef.current);
        syncRafRef.current = null;
      }
    };
  }, [
    active,
    hostElement,
    scheduleSyncBounds,
    startBoundsBurst,
    startResizeLoop,
    stopBoundsBurst,
    stopResizeLoop,
  ]);

  useEffect(() => {
    return () => {
      readyRef.current = false;
      lastSyncedBoundsRef.current = null;
      stopResizeLoop();
      stopBoundsBurst();
      if (syncRafRef.current != null) {
        window.cancelAnimationFrame(syncRafRef.current);
      }
      void teardownWebview();
    };
  }, [stopBoundsBurst, stopResizeLoop, teardownWebview]);

  const focusWebview = useCallback(async () => {
    if (!isTauriShell() || overlayBlockedRef.current) return;
    const webview = await getWebview();
    if (webview) await webview.setFocus();
  }, [getWebview]);

  return {
    isTauri: isTauriShell(),
    state,
    error,
    remount: mountWebview,
    focusWebview,
    hostRef: setHostRef,
  };
}

