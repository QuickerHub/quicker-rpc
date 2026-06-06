"use client";

import { useEffect, useState } from "react";
import { isTauriShell } from "@/lib/tauri-shell";
import {
  fetchTauriClipboardPluginStatus,
  tauriClipboardPluginStartRuntime,
  tauriClipboardPluginStopRuntime,
} from "@/lib/clipboard-history/clipboard-history-tauri";
import { fetchClipboardRuntimeHealth } from "@/lib/clipboard-history/clipboard-history-client";
import { resolveClipboardHttpPort } from "@/lib/clipboard-history/clipboard-history-config";
import type { ClipboardPluginStatusDto } from "@/lib/clipboard-history/clipboard-history-types";

type ClipboardHistorySettingsSectionProps = {
  active: boolean;
  disabled?: boolean;
};

export function ClipboardHistorySettingsSection({
  active,
  disabled = false,
}: ClipboardHistorySettingsSectionProps) {
  const [status, setStatus] = useState<ClipboardPluginStatusDto | null>(null);
  const [runtimeOnline, setRuntimeOnline] = useState(false);
  const [busy, setBusy] = useState(false);
  const inTauri = isTauriShell();

  const refresh = async () => {
    const host = await fetchTauriClipboardPluginStatus();
    setStatus(host);
    const port =
      host?.httpPort && host.httpPort > 0 ? host.httpPort : resolveClipboardHttpPort();
    const health = await fetchClipboardRuntimeHealth(port);
    setRuntimeOnline(health.ok && health.ready);
  };

  useEffect(() => {
    if (!active) return;
    void refresh();
  }, [active]);

  const handleStart = async () => {
    setBusy(true);
    try {
      const dto = await tauriClipboardPluginStartRuntime();
      setStatus(dto);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    setBusy(true);
    try {
      const dto = await tauriClipboardPluginStopRuntime();
      setStatus(dto);
      setRuntimeOnline(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="app-settings-card">
      <header className="app-settings-section-head">
        <h2 className="app-settings-section-title">剪贴板历史</h2>
        <p className="app-settings-section-desc">
          后台监听系统剪贴板并持久化历史。打开{" "}
          <a href="/clipboard" className="app-settings-inline-link">
            /clipboard
          </a>{" "}
          使用完整面板。
        </p>
      </header>

      <div className="app-settings-ping-row">
        <div className="app-settings-ping">
          <span
            className={`ping-dot ${
              runtimeOnline ? "ok" : status?.status === "starting" ? "loading" : "err"
            }`}
          />
          <span className="app-settings-ping-text">
            {runtimeOnline
              ? `剪贴板服务已连接（:${status?.httpPort || resolveClipboardHttpPort()}）`
              : status?.message ?? "剪贴板服务未运行"}
          </span>
        </div>
        <div className="app-settings-action-row">
          <button
            type="button"
            className="app-settings-action"
            onClick={() => void refresh()}
            disabled={disabled || busy}
          >
            检测
          </button>
          {inTauri ? (
            <>
              <button
                type="button"
                className="app-settings-action"
                onClick={() => void handleStart()}
                disabled={disabled || busy || runtimeOnline}
              >
                启动
              </button>
              <button
                type="button"
                className="app-settings-action"
                onClick={() => void handleStop()}
                disabled={disabled || busy || !runtimeOnline}
              >
                停止
              </button>
            </>
          ) : null}
        </div>
      </div>

      {!inTauri ? (
        <p className="app-settings-hint">
          浏览器开发模式：设置环境变量 <code>AGENT_GUI_CLIPBOARD_RUNTIME=1</code> 并由 Tauri 启动
          runtime，或手动运行 <code>cargo run</code>（clipboard-history-runtime）。
        </p>
      ) : null}
    </section>
  );
}
