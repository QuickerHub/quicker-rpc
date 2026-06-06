"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { isTauriShell } from "@/lib/tauri-shell";

const WEBVIEW_LABEL = "workspace-browser";

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

  const hideWebview = useCallback(async () => {
    if (!isTauriShell()) return;
    try {
      const { Webview } = await import("@tauri-apps/api/webview");
      const webview = await Webview.getByLabel(WEBVIEW_LABEL);
      if (webview) await webview.hide();
    } catch {
      // ignore
    }
  }, []);

  const syncBounds = useCallback(async () => {
    if (!isTauriShell() || !active) return;
    const host = hostRef.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;

    const { Webview } = await import("@tauri-apps/api/webview");
    const webview = await Webview.getByLabel(WEBVIEW_LABEL);
    if (!webview) return;

    const { LogicalPosition, LogicalSize } = await import("@tauri-apps/api/dpi");
    await webview.setPosition(new LogicalPosition(rect.left, rect.top));
    await webview.setSize(new LogicalSize(rect.width, rect.height));
    await webview.show();
  }, [active, hostRef]);

  const mountWebview = useCallback(async () => {
    if (!isTauriShell() || !active || busyRef.current) return;

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

    const targetUrl = url.trim() || "about:blank";
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
      const { LogicalPosition, LogicalSize } = await import("@tauri-apps/api/dpi");

      const appWindow = getCurrentWindow();

      const existing = await Webview.getByLabel(WEBVIEW_LABEL);
      if (existing) {
        await existing.close();
        readyRef.current = false;
      }

      const webview = new Webview(appWindow, WEBVIEW_LABEL, {
        url: targetUrl,
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
        focus: false,
        dragDropEnabled: false,
      });

      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error("webview create timeout")), 15_000);
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

      readyRef.current = true;
      lastMountKeyRef.current = mountKey;
      setState("ready");
    } catch (err) {
      readyRef.current = false;
      const message = err instanceof Error ? err.message : "WebView 创建失败";
      setError(message);
      setState("error");
    } finally {
      busyRef.current = false;
    }
  }, [active, hostRef, reloadKey, syncBounds, url]);

  useEffect(() => {
    if (!isTauriShell()) {
      setState("idle");
      return;
    }
    if (!active) {
      readyRef.current = false;
      setState("idle");
      void hideWebview();
      return;
    }
    void mountWebview();
  }, [active, hideWebview, mountWebview]);

  useEffect(() => {
    if (!isTauriShell() || !active) return;
    const host = hostRef.current;
    if (!host) return;

    const ro = new ResizeObserver(() => {
      void syncBounds();
    });
    ro.observe(host);
    window.addEventListener("resize", syncBounds);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", syncBounds);
    };
  }, [active, hostRef, syncBounds]);

  useEffect(() => {
    return () => {
      readyRef.current = false;
      void hideWebview();
    };
  }, [hideWebview]);

  const focusWebview = useCallback(async () => {
    if (!isTauriShell()) return;
    const { Webview } = await import("@tauri-apps/api/webview");
    const webview = await Webview.getByLabel(WEBVIEW_LABEL);
    if (webview) await webview.setFocus();
  }, []);

  return {
    isTauri: isTauriShell(),
    state,
    error,
    remount: mountWebview,
    focusWebview,
  };
}
