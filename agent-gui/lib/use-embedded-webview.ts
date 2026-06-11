"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { invokeDesktop } from "@/lib/desktop-bridge";
import {
  isDesktopShell,
  isElectronShell,
  isTauriShell,
} from "@/lib/desktop-shell";
import {
  applyEmbeddedWebViewBounds,
  applyEmbeddedWebViewLayoutBounds,
  boundsRectKey,
  measureEmbeddedWebViewHostLayout,
  type EmbeddedWebViewHostLayout,
} from "@/lib/embedded-webview-bounds";
import {
  subscribeEmbeddedWebViewBoundsRefresh,
  type EmbeddedWebViewBoundsRefreshMessage,
} from "@/lib/embedded-webview-bounds-channel";
import { WORKSPACE_BROWSER_WEBVIEW_LABEL } from "@/lib/embedded-webview-label";
import { subscribeBlockingOverlay } from "@/lib/embedded-webview-overlay";

export type EmbeddedWebViewState = "idle" | "loading" | "ready" | "error";

type UseEmbeddedWebViewOptions = {
  active: boolean;
  url: string;
  reloadKey: number;
  hostRef: RefObject<HTMLElement | null>;
  /** Electron multi-browser instance id (default browser when omitted). */
  browserId?: string;
};

/** Mount a native child webview over the host element (Tauri WebView2 or Electron WebContentsView). */
export function useEmbeddedWebView({
  active,
  url,
  reloadKey,
  hostRef,
  browserId = "default",
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
    if (!isDesktopShell()) return;
    if (isTauriShell()) {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        await getCurrentWindow().setFocus();
      } catch {
        // ignore
      }
    }
  }, []);

  const getTauriWebview = useCallback(async () => {
    if (!isTauriShell()) return null;
    const { Webview } = await import("@tauri-apps/api/webview");
    return Webview.getByLabel(WORKSPACE_BROWSER_WEBVIEW_LABEL);
  }, []);

  const teardownWebview = useCallback(async () => {
    if (isElectronShell()) {
      try {
        // Hide instead of destroy so tab switches keep page state;
        // actual destroy happens via embeddedBrowserClose on tab close.
        await invokeDesktop("embedded_browser_set_visible", {
          visible: false,
          browserId,
        });
      } catch {
        // ignore
      }
      return;
    }
    if (!isTauriShell()) return;
    try {
      const webview = await getTauriWebview();
      if (webview) {
        await webview.close();
      }
    } catch {
      // ignore
    }
    await focusMainWindow();
  }, [browserId, focusMainWindow, getTauriWebview]);

  const applyWebviewVisibility = useCallback(
    async (visible: boolean) => {
      if (isElectronShell()) {
        await invokeDesktop("embedded_browser_set_visible", { visible, browserId });
        return;
      }
      const webview = await getTauriWebview();
      if (!webview) return;
      if (!visible) {
        await webview.hide();
        return;
      }
      await webview.show();
    },
    [browserId, getTauriWebview],
  );

  const resolveLayout = useCallback(
    (message: EmbeddedWebViewBoundsRefreshMessage): EmbeddedWebViewHostLayout | null => {
      if (message.layout) return message.layout;
      const host = hostRef.current;
      if (!host) return null;
      return measureEmbeddedWebViewHostLayout(host);
    },
    [hostRef],
  );

  const applyElectronBounds = useCallback(
    async (layout: EmbeddedWebViewHostLayout, force = false) => {
      if (layout.width < 2 || layout.height < 2) {
        await applyWebviewVisibility(false);
        return false;
      }
      const rectKey = boundsRectKey({
        left: layout.left,
        top: layout.top,
        width: layout.width,
        height: layout.height,
      } as DOMRect);
      if (!force && rectKey === lastSyncedBoundsRef.current) return true;
      const visible = await invokeDesktop<boolean>("embedded_browser_set_bounds", {
        ...layout,
        browserId,
      });
      if (visible !== false) {
        lastSyncedBoundsRef.current = rectKey;
        await applyWebviewVisibility(!overlayBlockedRef.current);
        return true;
      }
      lastSyncedBoundsRef.current = null;
      return false;
    },
    [applyWebviewVisibility, browserId],
  );

  const applyBoundsMessage = useCallback(
    async (message: EmbeddedWebViewBoundsRefreshMessage) => {
      if (!isDesktopShell() || !active || !readyRef.current) return;
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
        if (isElectronShell()) {
          await applyElectronBounds(layout, message.force);
          return;
        }

        const webview = await getTauriWebview();
        if (!webview) return;

        const visible = await applyEmbeddedWebViewLayoutBounds(webview, layout);
        if (visible) {
          lastSyncedBoundsRef.current = rectKey;
          await applyWebviewVisibility(!overlayBlockedRef.current);
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
    [active, applyElectronBounds, applyWebviewVisibility, getTauriWebview, resolveLayout],
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

      const layout = measureEmbeddedWebViewHostLayout(host);
      const rectKey = boundsRectKey({
        left: layout.left,
        top: layout.top,
        width: layout.width,
        height: layout.height,
      } as DOMRect);
      if (!force && rectKey === lastSyncedBoundsRef.current) return;

      if (isElectronShell()) {
        const ok = await applyElectronBounds(layout, force);
        if (!ok) lastSyncedBoundsRef.current = null;
        return;
      }

      const webview = await getTauriWebview();
      if (!webview) return;

      const visible = await applyEmbeddedWebViewBounds(webview, host);
      if (visible) {
        lastSyncedBoundsRef.current = rectKey;
        await applyWebviewVisibility(!overlayBlockedRef.current);
      } else {
        lastSyncedBoundsRef.current = null;
      }
    },
    [applyElectronBounds, applyWebviewVisibility, getTauriWebview, hostRef],
  );

  const mountElectronWebview = useCallback(
    async (targetUrl: string, layout: EmbeddedWebViewHostLayout) => {
      await invokeDesktop("embedded_browser_mount", {
        url: targetUrl,
        ...layout,
        browserId,
      });
      readyRef.current = true;
      lastSyncedBoundsRef.current = null;
      setState("ready");
      await syncBoundsFromHost(true);
    },
    [browserId, syncBoundsFromHost],
  );

  const mountTauriWebview = useCallback(
    async (targetUrl: string, rect: DOMRect) => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const { Webview } = await import("@tauri-apps/api/webview");

      const appWindow = getCurrentWindow();
      const existing = await getTauriWebview();
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

      await webview.setAutoResize(false);
      readyRef.current = true;
      lastSyncedBoundsRef.current = null;
      setState("ready");
      await syncBoundsFromHost(true);
    },
    [getTauriWebview, syncBoundsFromHost],
  );

  const mountWebview = useCallback(async () => {
    if (!isDesktopShell() || !active || busyRef.current) return;

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
      const layout = measureEmbeddedWebViewHostLayout(host);
      if (isElectronShell()) {
        await mountElectronWebview(targetUrl, layout);
      } else {
        await mountTauriWebview(targetUrl, rect);
      }
      lastMountKeyRef.current = mountKey;
    } catch (err) {
      readyRef.current = false;
      const message = err instanceof Error ? err.message : "WebView 创建失败";
      setError(message);
      setState("error");
    } finally {
      busyRef.current = false;
    }
  }, [
    active,
    hostRef,
    mountElectronWebview,
    mountTauriWebview,
    reloadKey,
    syncBoundsFromHost,
    teardownWebview,
    url,
  ]);

  useEffect(() => {
    if (!isDesktopShell()) {
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
    if (!isDesktopShell() || !active) return;
    return subscribeEmbeddedWebViewBoundsRefresh(requestBoundsRefresh);
  }, [active, requestBoundsRefresh]);

  useEffect(() => {
    if (!isDesktopShell() || !active) return;

    return subscribeBlockingOverlay((blocked) => {
      overlayBlockedRef.current = blocked;
      if (blocked) {
        void applyWebviewVisibility(false);
        return;
      }
      requestBoundsRefresh({ force: true, reason: "manual" });
    });
  }, [active, applyWebviewVisibility, requestBoundsRefresh]);

  useEffect(() => {
    return () => {
      readyRef.current = false;
      lastSyncedBoundsRef.current = null;
      void teardownWebview();
    };
  }, [teardownWebview]);

  const focusWebview = useCallback(async () => {
    if (!isDesktopShell() || overlayBlockedRef.current) return;
    if (isTauriShell()) {
      const webview = await getTauriWebview();
      if (webview) await webview.setFocus();
    }
  }, [getTauriWebview]);

  return {
    isTauri: isDesktopShell(),
    isDesktop: isDesktopShell(),
    state,
    error,
    remount: mountWebview,
    focusWebview,
  };
}
