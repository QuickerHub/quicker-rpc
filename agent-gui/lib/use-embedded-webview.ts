"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  applyEmbeddedWebViewBounds,
  applyEmbeddedWebViewLayoutBounds,
  boundsRectKey,
  type EmbeddedWebViewHostLayout,
} from "@/lib/embedded-webview-bounds";
import {
  subscribeEmbeddedWebViewBoundsRefresh,
  type EmbeddedWebViewBoundsRefreshMessage,
} from "@/lib/embedded-webview-bounds-channel";
import { WORKSPACE_BROWSER_WEBVIEW_LABEL } from "@/lib/embedded-webview-label";
import { subscribeBlockingOverlay } from "@/lib/embedded-webview-overlay";
import { isTauriShell } from "@/lib/tauri-shell";

export type EmbeddedWebViewState = "idle" | "loading" | "ready" | "error";

type UseEmbeddedWebViewOptions = {
  active: boolean;
  url: string;
  reloadKey: number;
  hostRef: RefObject<HTMLElement | null>;
};

/** Mount a native Tauri child WebView over the host element (WebView2 on Windows). */
export function useEmbeddedWebView({
  active,
  url,
  reloadKey,
  hostRef,
}: UseEmbeddedWebViewOptions) {
  const [state, setState] = useState<EmbeddedWebViewState>("idle");
  const [error, setError] = useState<string | null>(null);
  const readyRef = useRef(false);
  const lastMountKeyRef = useRef("");
  const busyRef = useRef(false);
  const overlayBlockedRef = useRef(false);
  const syncInFlightRef = useRef(false);
  const syncPendingRef = useRef(false);
  const syncPendingMessageRef = useRef<EmbeddedWebViewBoundsRefreshMessage | null>(
    null,
  );
  const lastSyncedBoundsRef = useRef<string | null>(null);

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

  const resolveLayout = useCallback(
    (message: EmbeddedWebViewBoundsRefreshMessage): EmbeddedWebViewHostLayout | null => {
      if (message.layout) return message.layout;
      const host = hostRef.current;
      if (!host) return null;
      const rect = host.getBoundingClientRect();
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    },
    [hostRef],
  );

  const applyBoundsMessage = useCallback(
    async (message: EmbeddedWebViewBoundsRefreshMessage) => {
      if (!isTauriShell() || !active || !readyRef.current) return;
      if (syncInFlightRef.current) {
        syncPendingRef.current = true;
        syncPendingMessageRef.current = message;
        return;
      }

      const layout = resolveLayout(message);
      if (!layout) return;

      const rectKey = boundsRectKey({
        left: layout.left,
        top: layout.top,
        width: layout.width,
        height: layout.height,
      } as DOMRect);
      if (!message.force && rectKey === lastSyncedBoundsRef.current) return;

      syncInFlightRef.current = true;
      try {
        const webview = await getWebview();
        if (!webview) return;

        const visible = await applyEmbeddedWebViewLayoutBounds(webview, layout);
        if (visible) {
          lastSyncedBoundsRef.current = rectKey;
          await applyWebviewVisibility(webview);
        } else {
          lastSyncedBoundsRef.current = null;
        }
      } finally {
        syncInFlightRef.current = false;
        if (syncPendingRef.current) {
          const pending = syncPendingMessageRef.current;
          syncPendingRef.current = false;
          syncPendingMessageRef.current = null;
          if (pending) void applyBoundsMessage(pending);
        }
      }
    },
    [active, applyWebviewVisibility, getWebview, resolveLayout],
  );

  const requestBoundsRefresh = useCallback(
    (message: EmbeddedWebViewBoundsRefreshMessage) => {
      if (message.force) {
        lastSyncedBoundsRef.current = null;
      }
      void applyBoundsMessage(message);
    },
    [applyBoundsMessage],
  );

  const syncBoundsFromHost = useCallback(
    async (force = false) => {
      const host = hostRef.current;
      if (!host || !readyRef.current) return;

      const rect = host.getBoundingClientRect();
      const rectKey = boundsRectKey(rect);
      if (!force && rectKey === lastSyncedBoundsRef.current) return;

      const webview = await getWebview();
      if (!webview) return;

      const visible = await applyEmbeddedWebViewBounds(webview, host);
      if (visible) {
        lastSyncedBoundsRef.current = rectKey;
        await applyWebviewVisibility(webview);
      } else {
        lastSyncedBoundsRef.current = null;
      }
    },
    [applyWebviewVisibility, getWebview, hostRef],
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
      await syncBoundsFromHost(true);
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
      await syncBoundsFromHost(true);
    } catch (err) {
      readyRef.current = false;
      const message = err instanceof Error ? err.message : "WebView 创建失败";
      setError(message);
      setState("error");
    } finally {
      busyRef.current = false;
    }
  }, [active, getWebview, hostRef, reloadKey, syncBoundsFromHost, teardownWebview, url]);

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
    return subscribeEmbeddedWebViewBoundsRefresh(requestBoundsRefresh);
  }, [active, requestBoundsRefresh]);

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
      requestBoundsRefresh({ force: true, reason: "manual" });
    });
  }, [active, getWebview, requestBoundsRefresh]);

  useEffect(() => {
    return () => {
      readyRef.current = false;
      lastSyncedBoundsRef.current = null;
      void teardownWebview();
    };
  }, [teardownWebview]);

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
  };
}
