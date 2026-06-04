"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const PING_FETCH_MS = 15_000;
const DEFAULT_POLL_INTERVAL_MS = 15_000;

export type PingState =
  | { status: "loading" }
  | { status: "ok"; data: unknown }
  | { status: "error"; message: string };

export type RefreshPingOptions = {
  /** Keep current status label while re-checking (background poll). */
  silent?: boolean;
};

export type UseQkrpcPingOptions = {
  /** Periodic health checks; 0 disables polling (mount + boot retries only). */
  pollIntervalMs?: number;
  /** Skip polls while the tab is hidden (default true). */
  pausePollWhenHidden?: boolean;
};

function formatPingError(data: unknown, fallback: string): string {
  if (typeof data === "object" && data !== null) {
    const d = data as Record<string, unknown>;
    if (typeof d.stderr === "string" && d.stderr.trim()) {
      return d.stderr.trim();
    }
    if (typeof d.data === "string" && d.data.trim()) {
      return d.data.trim().slice(0, 120);
    }
    if (typeof d.data === "object" && d.data !== null && "error" in d.data) {
      const err = (d.data as { error: unknown }).error;
      if (typeof err === "string") return err;
    }
  }
  return fallback;
}

export function useQkrpcPing(options: UseQkrpcPingOptions = {}) {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const pausePollWhenHidden = options.pausePollWhenHidden ?? true;

  const [ping, setPing] = useState<PingState>({ status: "loading" });
  const [connectTick, setConnectTick] = useState(0);
  const inFlightRef = useRef(false);
  const pingStatusRef = useRef<PingState["status"]>("loading");

  const refreshPing = useCallback(async (opts?: RefreshPingOptions) => {
    const silent = opts?.silent ?? false;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    if (!silent) {
      setPing({ status: "loading" });
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), PING_FETCH_MS);
    try {
      const res = await fetch("/api/ping", {
        signal: controller.signal,
        cache: "no-store",
      });
      const raw = await res.text();
      let data: unknown = null;
      if (raw.trim()) {
        try {
          data = JSON.parse(raw) as unknown;
        } catch {
          pingStatusRef.current = "error";
          setPing({ status: "error", message: "健康检查响应无效" });
          return;
        }
      }
      const ok =
        typeof data === "object"
        && data !== null
        && "ok" in data
        && (data as { ok: boolean }).ok;
      if (res.ok && ok) {
        const prevStatus = pingStatusRef.current;
        pingStatusRef.current = "ok";
        setPing({ status: "ok", data });
        if (!silent || prevStatus !== "ok") {
          setConnectTick((n) => n + 1);
        }
        return;
      }
      pingStatusRef.current = "error";
      setPing({
        status: "error",
        message: formatPingError(data, res.ok ? "未连接 Quicker" : `HTTP ${res.status}`),
      });
    } catch (e) {
      const message =
        e instanceof Error && e.name === "AbortError"
          ? "检测超时（请确认 pnpm dev 已启动且 qkrpc 可用）"
          : e instanceof Error
            ? e.message
            : String(e);
      pingStatusRef.current = "error";
      setPing({ status: "error", message });
    } finally {
      window.clearTimeout(timer);
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    void refreshPing();
  }, [refreshPing]);

  // start.mjs may still be launching qkrpc serve when the page first loads
  const pingBootRetriesRef = useRef(0);
  useEffect(() => {
    if (ping.status !== "error") return;
    if (pingBootRetriesRef.current >= 2) return;
    const delayMs = pingBootRetriesRef.current === 0 ? 2_000 : 5_000;
    pingBootRetriesRef.current += 1;
    const timer = window.setTimeout(
      () => void refreshPing({ silent: true }),
      delayMs,
    );
    return () => window.clearTimeout(timer);
  }, [ping.status, refreshPing]);

  useEffect(() => {
    if (pollIntervalMs <= 0) return;
    const tick = () => {
      if (pausePollWhenHidden && document.visibilityState === "hidden") {
        return;
      }
      void refreshPing({ silent: true });
    };
    const id = window.setInterval(tick, pollIntervalMs);
    return () => window.clearInterval(id);
  }, [pollIntervalMs, pausePollWhenHidden, refreshPing]);

  useEffect(() => {
    if (!pausePollWhenHidden) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshPing({ silent: true });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [pausePollWhenHidden, refreshPing]);

  return { ping, refreshPing, connectTick };
}
