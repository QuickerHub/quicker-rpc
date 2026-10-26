"use client";

import { useId, useRef } from "react";
import { useQuickerNativeMcpSettings } from "@/lib/use-quicker-native-mcp-settings";
import type { QuickerNativeMcpDiscovery, QuickerNativeMcpProbeResult } from "@/lib/quicker-native-mcp-settings";

const discoveryLabels: Record<QuickerNativeMcpDiscovery["status"], string> = {
  found: "已发现本机原生 MCP", missing: "未发现本机原生 MCP", disabled: "Quicker 原生 MCP 尚未开启",
  invalid: "本机原生 MCP 配置无效", unavailable: "暂时无法读取本机原生 MCP 配置",
};
const probeLabels: Record<QuickerNativeMcpProbeResult["status"], string> = {
  ok: "本次检测成功", unavailable: "本次检测不可用", unauthorized: "本次检测鉴权失败",
  "consent-required": "本次检测需要 Quicker 授权", error: "本次检测失败", source_changed: "检测期间来源已变化",
};

export function QuickerNativeMcpSettingsSection({ cwd, active, disabled = false }: { cwd: string; active: boolean; disabled?: boolean }) {
  const view = useQuickerNativeMcpSettings(cwd, active);
  const hintId = useId();
  const probeButton = useRef<HTMLButtonElement>(null);
  const state = view.state;
  const busy = !!view.pending;
  const switchDisabled = disabled || !active || !state || busy || state.effective.blocked;
  const probeDisabled = disabled || !active || !state || busy || state.discovery.status !== "found";
  return (
    <section className="native-mcp-settings" aria-label="原生 MCP 连接" aria-busy={busy}>
      <div className="native-mcp-settings-row">
        <h3 className="app-settings-section-title">原生 MCP</h3>
        <button type="button" className="app-settings-action" onClick={view.refresh} disabled={disabled || !active || !cwd.trim()}>刷新配置</button>
      </div>
      <div className="native-mcp-settings-row">
        <span>使用原生 MCP</span>
        <button type="button" role="switch" aria-label="使用原生 MCP" aria-describedby={hintId}
          aria-checked={state?.userEnabled ?? false} aria-disabled={switchDisabled}
          className="native-mcp-settings-switch" onClick={() => { if (!switchDisabled) view.setEnabled(!state!.userEnabled); }}>
          <span className="native-mcp-settings-switch-knob" />
        </button>
      </div>
      <p id={hintId} className="native-mcp-settings-hint">用户设置，用于后续对话轮次。检测不会启用服务，也不授予动作写入权限。</p>
      <div className="native-mcp-settings-status" role="status" aria-live="polite">
        {!cwd.trim() ? <p>等待当前工作区…</p> : view.pending === "load" ? <p>正在读取配置…</p> : null}
        {state ? <>
          {view.pending === "load" ? <p>以下为上次读取的配置：</p> : null}
          <p>{state.effective.enabled ? "当前工作区已启用" : "当前工作区未启用"} · {state.effective.scope === "workspace" ? "工作区配置" : state.effective.scope === "user" ? "用户配置" : "尚未配置"}</p>
          <p>{discoveryLabels[state.discovery.status]}</p>
          {state.discovery.message ? <p>{state.discovery.message}</p> : null}
          {state.effective.message ? <p>{state.effective.message}</p> : state.effective.scope === "workspace" ? <p>当前工作区覆盖用户配置；请在工作区配置中调整。</p> : null}
        </> : null}
        {view.pending === "save" ? <p>正在保存用户设置…</p> : null}
      </div>
      <div className="native-mcp-settings-actions">
        <button ref={probeButton} type="button" className="app-settings-action" aria-disabled={probeDisabled}
          onClick={() => { if (!probeDisabled) view.probeNow(); }}>{view.pending === "probe" ? "正在检测…" : "检测本机服务"}</button>
        {view.pending === "probe" ? <button type="button" className="app-settings-action" onClick={() => { view.cancel(); probeButton.current?.focus(); }}>取消检测</button> : null}
      </div>
      {view.probe ? <div className="native-mcp-settings-probe" role={view.probe.status === "ok" ? "status" : "alert"}>
        <p>{probeLabels[view.probe.status]} · <time dateTime={view.probe.checkedAt}>{view.probe.checkedAt}</time></p>
        {view.probe.status === "ok" ? <>
          <p>服务：{view.probe.serverInfo?.name ?? "未知"} · 版本：{view.probe.serverInfo?.version ?? "未知"}</p>
          <p>工具数：{view.probe.toolCount ?? "未知"}。结果仅代表本次检测。</p>
        </> : null}
        {view.probe.message ? <p>{view.probe.message}</p> : null}
      </div> : null}
      {view.error ? <p className="native-mcp-settings-error" role="alert">{view.error}</p> : null}
    </section>
  );
}
