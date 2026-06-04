"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Client abort; server fast path targets ~1.2s health. */
const PING_FETCH_FAST_MS = 4_500;
const PING_FETCH_FULL_MS = 10_000;
const DEFAULT_POLL_INTERVAL_MS = 15_000;
/** Poll faster while RPC is down so reconnect after hot-update feels snappy. */
const ERROR_POLL_INTERVAL_MS = 2_500;

const BOOT_RETRY_DELAYS_MS = [250, 500, 900, 1_500, 2_500, 4_000, 6_000];

export type PingState =
  | { status: "loading" }
  | { status: "ok"; data: unknown }
  | { status: "error"; message: string };

export type RefreshPingOptions = {
  /** Keep current status label while re-checking (background poll). */
  silent?: boolean;
  /** Use short server health timeout (default true). */
  fast?: boolean;
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

function pingUrl(fast: boolean): string {
  return fast ? "/api/ping?fast=1" : "/api/ping?fast=0";
}

export function useQkrpcPing(options: UseQkrpcPingOptions = {}) {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const pausePollWhenHidden = options.pausePollWhenHidden ?? true;

  const [ping, setPing] = useState<PingState>({ status: "loading" });
  const [connectTick, setConnectTick] = useState(0);
  const pingStatusRef = useRef<PingState["status"]>("loading");
  const abortRef = useRef<AbortController | null>(null);
  const bootRetryIndexRef = useRef(0);

  const refreshPing = useCallback(async (opts?: RefreshPingOptions) => {
    const silent = opts?.silent ?? false;
    const fast = opts?.fast ?? true;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!silent) {
      setPing({ status: "loading" });
    }

    const timeoutMs = fast ? PING_FETCH_FAST_MS : PING_FETCH_FULL_MS;
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(pingUrl(fast), {
        signal: controller.signal,
        cache: "no-store",
      });
      if (controller.signal.aborted) return;

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
        bootRetryIndexRef.current = 0;
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
      if (controller.signal.aborted) return;
      const message =
        e instanceof Error && e.name === "AbortError"
          ? "检测超时（请确认 qkrpc serve 已启动）"
          : e instanceof Error
            ? e.message
            : String(e);
      pingStatusRef.current = "error";
      setPing({ status: "error", message });
    } finally {
      window.clearTimeout(timer);
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    void refreshPing({ fast: true });
  }, [refreshPing]);

  useEffect(() => {
    if (ping.status !== "error") {
      bootRetryIndexRef.current = 0;
      return;
    }
    const idx = bootRetryIndexRef.current;
    if (idx >= BOOT_RETRY_DELAYS_MS.length) return;
    const delayMs = BOOT_RETRY_DELAYS_MS[idx]!;
    bootRetryIndexRef.current = idx + 1;
    const timer = window.setTimeout(
      () => void refreshPing({ silent: true, fast: true }),
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
      const fastPoll =
        pingStatusRef.current === "error"
        || pingStatusRef.current === "loading";
      void refreshPing({ silent: true, fast: fastPoll });
    };
    const intervalMs =
      pingStatusRef.current === "error"
        ? Math.min(pollIntervalMs, ERROR_POLL_INTERVAL_MS)
        : pollIntervalMs;
    const id = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(id);
  }, [pollIntervalMs, pausePollWhenHidden, refreshPing, ping.status]);

  useEffect(() => {
    if (!pausePollWhenHidden) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshPing({ silent: true, fast: true });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [pausePollWhenHidden, refreshPing]);

  const refreshPingNow = useCallback(() => {
    void refreshPing({ silent: false, fast: true });
  }, [refreshPing]);

  return { ping, refreshPing, refreshPingNow, connectTick };
}
