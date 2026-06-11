"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppSettingsTabId } from "@/lib/app-settings-tabs";
import {
  isPluginCatalogActionable,
  PLUGIN_CATALOG,
  type PluginCatalogEntry,
} from "@/lib/plugin-catalog";
import {
  applyPluginUpdate,
  fetchPluginList,
  pluginRegistryRefresh,
  type PluginStatusDto,
} from "@/lib/plugin-runtime-client";
import { isTauriShell } from "@/lib/tauri-shell";
import { requestVoicePluginSetup } from "@/lib/voice-input/voice-plugin-install-flow";
import {
  tauriVoicePluginStartRuntime,
  tauriVoicePluginStopRuntime,
} from "@/lib/voice-input/voice-input-tauri";

type PluginsSettingsSectionProps = {
  active: boolean;
  disabled?: boolean;
  onRequestTab?: (tab: AppSettingsTabId) => void;
};

type PluginRow = {
  catalog: PluginCatalogEntry;
  status: PluginStatusDto | null;
};

function statusDotClass(row: PluginRow): string {
  const { catalog, status } = row;
  if (!isPluginCatalogActionable(catalog)) return "";
  if (!status) return "loading";
  if (status.running) return "ok";
  if (status.installed) return "";
  return "";
}

function statusLabel(row: PluginRow): string {
  const { catalog, status } = row;
  if (catalog.availability === "disabled") {
    return "暂未开放";
  }
  if (catalog.availability === "coming-soon") {
    return "即将推出";
  }
  if (!status) return "检测中…";
  if (!status.hostCompatible) return "需升级 Host";
  if (status.updateAvailable) return "有更新";
  if (status.running) return "运行中";
  if (status.installed) return "已安装";
  return "未安装";
}

function versionLine(row: PluginRow): string | null {
  const { status } = row;
  if (!status?.installed) return null;
  const installed = status.installedVersion?.trim();
  const latest = status.latestVersion?.trim();
  if (installed && latest && installed !== latest) {
    return `${installed} → ${latest}`;
  }
  if (installed) return `v${installed}`;
  return null;
}

export function PluginsSettingsSection({
  active,
  disabled = false,
  onRequestTab,
}: PluginsSettingsSectionProps) {
  const [rows, setRows] = useState<PluginRow[]>(() =>
    PLUGIN_CATALOG.map((catalog) => ({ catalog, status: null })),
  );
  const [loading, setLoading] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [actionPluginId, setActionPluginId] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const inTauri = isTauriShell();

  const mergeStatuses = useCallback((statuses: PluginStatusDto[]) => {
    setRows(
      PLUGIN_CATALOG.map((catalog) => ({
        catalog,
        status: statuses.find((item) => item.pluginId === catalog.id) ?? null,
      })),
    );
  }, []);

  const loadPlugins = useCallback(async () => {
    if (!inTauri) {
      setRows(PLUGIN_CATALOG.map((catalog) => ({ catalog, status: null })));
      return;
    }
    setLoading(true);
    try {
      const list = await fetchPluginList();
      mergeStatuses(list);
    } finally {
      setLoading(false);
    }
  }, [inTauri, mergeStatuses]);

  useEffect(() => {
    if (!active) return;
    void loadPlugins();
  }, [active, loadPlugins]);

  useEffect(() => {
    if (!active) return;
    const onVoiceChanged = () => void loadPlugins();
    window.addEventListener("voice-input-config-changed", onVoiceChanged);
    return () =>
      window.removeEventListener("voice-input-config-changed", onVoiceChanged);
  }, [active, loadPlugins]);

  const handleRefresh = async () => {
    if (refreshBusy || disabled || !inTauri) return;
    setRefreshBusy(true);
    setHint(null);
    try {
      try {
        await pluginRegistryRefresh();
      } catch {
        // Best-effort; cached registry is enough for UI.
      }
      await loadPlugins();
      setHint("插件目录已刷新");
    } catch (err) {
      setHint(err instanceof Error ? err.message : "刷新失败");
    } finally {
      setRefreshBusy(false);
    }
  };

  const runPluginAction = async (
    pluginId: string,
    action: () => Promise<void>,
  ) => {
    if (disabled || actionPluginId) return;
    setActionPluginId(pluginId);
    setHint(null);
    try {
      await action();
      await loadPlugins();
    } catch (err) {
      setHint(err instanceof Error ? err.message : "操作失败");
    } finally {
      setActionPluginId(null);
    }
  };

  const handleInstall = (pluginId: string) => {
    if (pluginId !== "voice-asr") return;
    void runPluginAction(pluginId, async () => {
      const ok = await requestVoicePluginSetup({ skipConfirm: false });
      if (!ok) throw new Error("安装未完成");
      setHint("语音插件安装完成");
      window.dispatchEvent(new Event("voice-input-config-changed"));
    });
  };

  const handleUpdate = (pluginId: string) => {
    void runPluginAction(pluginId, async () => {
      const status = await applyPluginUpdate(pluginId);
      setHint(status?.message ?? "更新完成");
      window.dispatchEvent(new Event("voice-input-config-changed"));
    });
  };

  const handleStart = (pluginId: string) => {
    if (pluginId !== "voice-asr") return;
    void runPluginAction(pluginId, async () => {
      await tauriVoicePluginStartRuntime();
      setHint("语音服务已启动");
      window.dispatchEvent(new Event("voice-input-config-changed"));
    });
  };

  const handleStop = (pluginId: string) => {
    if (pluginId !== "voice-asr") return;
    void runPluginAction(pluginId, async () => {
      await tauriVoicePluginStopRuntime();
      setHint("语音服务已停止");
      window.dispatchEvent(new Event("voice-input-config-changed"));
    });
  };

  const desktopOnlyHint = useMemo(() => {
    if (inTauri) return null;
    return "插件安装与管理仅在 QuickerAgent 桌面版可用；浏览器开发模式请使用各功能设置页。";
  }, [inTauri]);

  return (
    <div className="plugins-settings">
      <header className="app-settings-section-head app-settings-section-head--inline plugins-settings-head">
        <div>
          <h2 className="app-settings-section-title">插件</h2>
          <p className="app-settings-section-hint">
            可选能力以独立 Runtime 安装，版本与 QuickerAgent 主程序解耦。
          </p>
        </div>
        {inTauri ? (
          <button
            type="button"
            className="app-settings-action"
            disabled={disabled || refreshBusy || loading}
            onClick={() => void handleRefresh()}
          >
            {refreshBusy ? "刷新中…" : "检查更新"}
          </button>
        ) : null}
      </header>

      {desktopOnlyHint ? (
        <p className="plugins-settings-footnote">{desktopOnlyHint}</p>
      ) : null}

      {hint ? <p className="plugins-settings-hint">{hint}</p> : null}

      <ul className="plugins-settings-list">
        {rows.map((row) => {
          const { catalog, status } = row;
          const actionable = isPluginCatalogActionable(catalog);
          const busy = actionPluginId === catalog.id;
          const version = versionLine(row);
          const detailMessage =
            status?.message
            ?? (catalog.availability === "disabled"
              ? "功能暂时关闭，后续版本将在此提供安装。"
              : null);

          return (
            <li key={catalog.id} className="plugins-settings-card">
              <div className="plugins-settings-card-main">
                <div className="plugins-settings-card-title-row">
                  <span
                    className={`ping-dot ${statusDotClass(row)}`}
                    aria-hidden
                  />
                  <h3 className="plugins-settings-card-title">
                    {status?.displayName ?? catalog.displayName}
                  </h3>
                  <span className="plugins-settings-card-badge">
                    {statusLabel(row)}
                  </span>
                </div>
                <p className="plugins-settings-card-desc">{catalog.description}</p>
                {catalog.sizeHint ? (
                  <p className="plugins-settings-card-meta">{catalog.sizeHint}</p>
                ) : null}
                {version ? (
                  <p className="plugins-settings-card-meta">版本 {version}</p>
                ) : null}
                {detailMessage ? (
                  <p className="plugins-settings-card-message">{detailMessage}</p>
                ) : null}
              </div>

              {actionable && inTauri ? (
                <div className="plugins-settings-card-actions">
                  {!status?.installed ? (
                    <button
                      type="button"
                      className="app-settings-action app-settings-action--primary"
                      disabled={disabled || busy || loading}
                      onClick={() => handleInstall(catalog.id)}
                    >
                      {busy ? "安装中…" : "安装"}
                    </button>
                  ) : null}

                  {status?.installed && status.updateAvailable && status.hostCompatible ? (
                    <button
                      type="button"
                      className="app-settings-action"
                      disabled={disabled || busy}
                      onClick={() => handleUpdate(catalog.id)}
                    >
                      {busy ? "更新中…" : "更新"}
                    </button>
                  ) : null}

                  {status?.installed && catalog.id === "voice-asr" ? (
                    status.running ? (
                      <button
                        type="button"
                        className="app-settings-action"
                        disabled={disabled || busy}
                        onClick={() => handleStop(catalog.id)}
                      >
                        {busy ? "停止中…" : "停止"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="app-settings-action"
                        disabled={disabled || busy}
                        onClick={() => handleStart(catalog.id)}
                      >
                        {busy ? "启动中…" : "启动"}
                      </button>
                    )
                  ) : null}

                  {status?.installed && catalog.settingsTab && onRequestTab ? (
                    <button
                      type="button"
                      className="app-settings-action"
                      disabled={disabled}
                      onClick={() => onRequestTab(catalog.settingsTab!)}
                    >
                      {catalog.settingsTab === "voice" ? "语音设置" : "打开设置"}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <p className="plugins-settings-footnote">
        规范见仓库{" "}
        <code>docs/quicker-agent-plugin-spec.md</code>
        。Runtime 更新通常无需升级 QuickerAgent 主程序。
      </p>
    </div>
  );
}
