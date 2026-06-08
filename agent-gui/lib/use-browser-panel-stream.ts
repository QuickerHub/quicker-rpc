"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { browserPanelDeviceScaleFactor } from "@/lib/browser-panel-display-scale";
import { buildBrowserPanelWsUrl } from "@/lib/browser-panel-stream-config";
import { requestBrowserRuntimeStart } from "@/lib/browser-dev-runtime";

export type BrowserPanelStreamState = {
  url: string;
  title: string;
  viewportWidth: number;
  viewportHeight: number;
};

type UseBrowserPanelStreamOptions = {
  active: boolean;
  sessionId: string;
  hostRef: RefObject<HTMLElement | null>;
  retryToken?: number;
  onState?: (state: BrowserPanelStreamState) => void;
};

type OutboundMessage =
  | { type: "subscribe"; sessionId: string }
  | { type: "viewport"; width: number; height: number; deviceScaleFactor?: number }
  | { type: "mousemove"; x: number; y: number }
  | { type: "click"; x: number; y: number; button?: string }
  | { type: "wheel"; deltaX: number; deltaY: number }
  | { type: "keydown"; key: string }
  | { type: "type"; text: string };

/** Connect to quicker-browser-runtime panel WebSocket (independent Chromium process). */
export function useBrowserPanelStream({
  active,
  sessionId,
  hostRef,
  retryToken = 0,
  onState,
}: UseBrowserPanelStreamOptions) {
  const [frameSrc, setFrameSrc] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const viewportRef = useRef({ width: 1280, height: 800 });
  const onStateRef = useRef(onState);
  const pendingMouseMoveRef = useRef<{ x: number; y: number } | null>(null);
  const mouseMoveFrameRef = useRef<number | null>(null);
  const viewportPushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  onStateRef.current = onState;

  const send = useCallback((message: OutboundMessage) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(message));
  }, []);

  const pushViewport = useCallback(
    (immediate = false) => {
      const host = hostRef.current;
      if (!host) return;
      const rect = host.getBoundingClientRect();
      const width = Math.max(120, Math.round(rect.width));
      const height = Math.max(120, Math.round(rect.height));
      const deviceScaleFactor = browserPanelDeviceScaleFactor();
      viewportRef.current = { width, height };

      const deliver = () => {
        viewportPushTimerRef.current = null;
        send({ type: "viewport", width, height, deviceScaleFactor });
      };

      if (immediate) {
        if (viewportPushTimerRef.current) {
          clearTimeout(viewportPushTimerRef.current);
          viewportPushTimerRef.current = null;
        }
        deliver();
        return;
      }

      if (viewportPushTimerRef.current) clearTimeout(viewportPushTimerRef.current);
      viewportPushTimerRef.current = setTimeout(deliver, 120);
    },
    [hostRef, send],
  );

  const connect = useCallback(async () => {
    if (!active || wsRef.current?.readyState === WebSocket.OPEN) return;
    setConnecting(true);
    setError(null);
    try {
      const started = await requestBrowserRuntimeStart();
      if (!started) {
        setError(
          "无法启动 browser-runtime。请运行: pnpm browser:install && pnpm browser:dev-server",
        );
        return;
      }

      const ws = new WebSocket(buildBrowserPanelWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setConnecting(false);
        send({ type: "subscribe", sessionId });
        pushViewport(true);
      };

      ws.onmessage = (event) => {
        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(String(event.data)) as Record<string, unknown>;
        } catch {
          return;
        }
        const type = String(payload.type ?? "");
        if (type === "frame" && typeof payload.data === "string") {
          const mime =
            typeof payload.mimeType === "string" ? payload.mimeType : "image/jpeg";
          setFrameSrc(`data:${mime};base64,${payload.data}`);
          return;
        }
        if (type === "state") {
          const url = typeof payload.url === "string" ? payload.url : "";
          const title = typeof payload.title === "string" ? payload.title : "";
          const viewportWidth =
            typeof payload.viewportWidth === "number" ? payload.viewportWidth : 1280;
          const viewportHeight =
            typeof payload.viewportHeight === "number" ? payload.viewportHeight : 800;
          viewportRef.current = { width: viewportWidth, height: viewportHeight };
          onStateRef.current?.({ url, title, viewportWidth, viewportHeight });
          return;
        }
        if (type === "error" && typeof payload.message === "string") {
          setError(payload.message);
        }
      };

      ws.onerror = () => {
        setError("浏览器流连接失败");
        setConnected(false);
        setConnecting(false);
      };

      ws.onclose = () => {
        setConnected(false);
        setConnecting(false);
        wsRef.current = null;
      };
    } catch (err) {
      setConnecting(false);
      setError(err instanceof Error ? err.message : "浏览器流连接失败");
    }
  }, [active, pushViewport, send, sessionId]);

  useEffect(() => {
    if (!active) {
      wsRef.current?.close();
      wsRef.current = null;
      setConnected(false);
      setFrameSrc(null);
      return;
    }
    void connect();
    return () => {
      if (viewportPushTimerRef.current) {
        clearTimeout(viewportPushTimerRef.current);
        viewportPushTimerRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [active, connect, retryToken, sessionId]);

  useEffect(() => {
    if (!active || !connected) return;
    const host = hostRef.current;
    if (!host) return;
    const ro = new ResizeObserver(() => {
      pushViewport();
    });
    ro.observe(host);
    pushViewport();
    return () => ro.disconnect();
  }, [active, connected, hostRef, pushViewport]);

  const mapClientToViewport = useCallback(
    (clientX: number, clientY: number, rect: DOMRect) => {
      const { width, height } = viewportRef.current;
      if (rect.width <= 0 || rect.height <= 0) return null;
      return {
        x: Math.round(((clientX - rect.left) / rect.width) * width),
        y: Math.round(((clientY - rect.top) / rect.height) * height),
      };
    },
    [],
  );

  const clickAt = useCallback(
    (clientX: number, clientY: number, rect: DOMRect) => {
      const mapped = mapClientToViewport(clientX, clientY, rect);
      if (!mapped) return;
      send({ type: "click", x: mapped.x, y: mapped.y, button: "left" });
    },
    [mapClientToViewport, send],
  );

  const moveAt = useCallback(
    (clientX: number, clientY: number, rect: DOMRect) => {
      const mapped = mapClientToViewport(clientX, clientY, rect);
      if (!mapped) return;
      pendingMouseMoveRef.current = mapped;
      if (mouseMoveFrameRef.current != null) return;
      mouseMoveFrameRef.current = window.requestAnimationFrame(() => {
        mouseMoveFrameRef.current = null;
        const pending = pendingMouseMoveRef.current;
        pendingMouseMoveRef.current = null;
        if (pending) send({ type: "mousemove", ...pending });
      });
    },
    [mapClientToViewport, send],
  );

  const wheelAt = useCallback(
    (deltaX: number, deltaY: number) => {
      send({ type: "wheel", deltaX, deltaY });
    },
    [send],
  );

  const pressKey = useCallback(
    (key: string) => {
      if (!key) return;
      send({ type: "keydown", key });
    },
    [send],
  );

  const typeText = useCallback(
    (text: string) => {
      if (!text) return;
      send({ type: "type", text });
    },
    [send],
  );

  return {
    frameSrc,
    connected,
    connecting,
    error,
    moveAt,
    clickAt,
    wheelAt,
    pressKey,
    typeText,
    mapClientToViewport,
    retryConnect: connect,
  };
}
