"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { QuickerNativeMcpProbeResult, QuickerNativeMcpSettingsRequest, QuickerNativeMcpSettingsResponse, QuickerNativeMcpSettingsState } from "./quicker-native-mcp-settings";

type Pending = "load" | "probe" | "save";
type View = { cwd: string; state?: QuickerNativeMcpSettingsState; probe?: QuickerNativeMcpProbeResult; pending: Pending | null; error?: string };
const endpoint = "/api/settings/quicker-native-mcp";

function validState(value: unknown): value is QuickerNativeMcpSettingsState {
  if (!value || typeof value !== "object") return false;
  const state = value as QuickerNativeMcpSettingsState;
  return typeof state.cwd === "string" && typeof state.revision === "string" && !!state.revision
    && typeof state.userEnabled === "boolean" && typeof state.userManaged === "boolean"
    && !!state.effective && typeof state.effective.enabled === "boolean" && typeof state.effective.managed === "boolean"
    && typeof state.effective.blocked === "boolean" && ["user", "workspace", "none"].includes(state.effective.scope)
    && !!state.discovery && ["found", "missing", "disabled", "invalid", "unavailable"].includes(state.discovery.status)
    && (state.discovery.identity === null || typeof state.discovery.identity === "string");
}

/** Settings requests own their snapshot; no probe creates or replaces a turn's MCP client. */
export function useQuickerNativeMcpSettings(cwd: string, active: boolean) {
  const [view, setView] = useState<View>({ cwd, pending: null });
  const generation = useRef(0);
  const requestRef = useRef<AbortController | null>(null);
  const request = useCallback(async (body?: QuickerNativeMcpSettingsRequest) => {
    if (!active || !cwd.trim()) return;
    const id = ++generation.current;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const pending: Pending = body ? body.action === "probe" ? "probe" : "save" : "load";
    setView(previous => ({ cwd, state: previous.cwd === cwd ? previous.state : undefined,
      error: previous.cwd === cwd ? previous.error : undefined, pending }));
    const current = () => generation.current === id && !controller.signal.aborted;
    try {
      const response = await fetch(`${endpoint}?cwd=${encodeURIComponent(cwd)}`, {
        method: body ? "POST" : "GET", signal: controller.signal, cache: "no-store",
        ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
      const data: QuickerNativeMcpSettingsResponse = await response.json();
      if (!current()) return;
      if (data?.state && data.state.cwd !== cwd) {
        setView({ cwd, pending: null, error: "返回的设置不属于当前工作区，请刷新配置后重试。" });
        return;
      }
      const state = validState(data?.state) ? data.state : undefined;
      if (!response.ok || data?.ok !== true || !state) {
        setView(previous => ({ cwd, state: state ?? (previous.cwd === cwd ? previous.state : undefined), pending: null,
          error: typeof data?.error?.message === "string" ? data.error.message : "无法读取原生 MCP 设置，请刷新配置后重试。" }));
        return;
      }
      const probe = data.probe;
      if (body?.action === "probe" && (!probe || typeof probe.checkedAt !== "string"
        || !["ok", "unavailable", "unauthorized", "consent-required", "error", "source_changed"].includes(probe.status)
        || (probe.status === "ok" && (!state.discovery.identity || probe.sourceIdentity !== state.discovery.identity)))) {
        setView({ cwd, state, pending: null, error: "检测结果与当前来源不一致，请刷新配置后重新检测。" });
        return;
      }
      setView({ cwd, state, pending: null, ...(body?.action === "probe" ? { probe } : {}) });
    } catch {
      if (!current()) return;
      setView(previous => ({ cwd, state: previous.cwd === cwd ? previous.state : undefined, pending: null,
        error: pending === "save" ? "未收到保存结果；设置可能已生效，请刷新配置确认。" : "原生 MCP 请求失败，请刷新配置后重试。" }));
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }, [active, cwd]);

  useLayoutEffect(() => {
    if (active && cwd.trim()) void request();
    return () => { ++generation.current; requestRef.current?.abort(); requestRef.current = null; };
  }, [active, cwd, request]);

  const current: View = active && view.cwd === cwd ? view : { cwd, pending: null };
  const state = current.state;
  const setEnabled = (enabled: boolean) => {
    if (!state || current.pending || state.effective.blocked) return;
    void request({ action: "set-enabled", cwd, revision: state.revision, enabled });
  };
  const probe = () => {
    if (!state || current.pending || state.discovery.status !== "found") return;
    void request({ action: "probe", cwd, revision: state.revision });
  };
  const cancel = () => {
    if (current.pending !== "probe") return;
    ++generation.current;
    requestRef.current?.abort(); requestRef.current = null;
    setView(previous => ({ ...previous, pending: null, probe: undefined, error: "检测已取消。" }));
  };
  return { ...current, refresh: () => void request(), setEnabled, probeNow: probe, cancel };
}
