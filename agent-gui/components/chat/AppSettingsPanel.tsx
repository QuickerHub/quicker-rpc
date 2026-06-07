"use client";

import { useCallback, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AccountUsageSection } from "@/components/chat/AccountUsageSection";
import { AppVersionSection } from "@/components/chat/AppVersionSection";
import { LlmKeysSettingsSection } from "@/components/chat/LlmKeysSettingsSection";
import { VoiceInputSettingsSection } from "@/components/chat/VoiceInputSettingsSection";
import { LauncherSettingsSection } from "@/components/chat/LauncherSettingsSection";
import type { AppSettingsTabId } from "@/lib/app-settings-tabs";
import type { LlmProviderId } from "@/lib/llm-providers";
import type { PingState } from "@/lib/use-qkrpc-ping";

type AppSettingsPanelProps = {
  active: boolean;
  activeTab: AppSettingsTabId;
  ping: PingState;
  onRefreshPing: () => void;
  versionRefreshKey?: number;
  focusProviderId?: LlmProviderId;
  disabled?: boolean;
};

function pingLabel(ping: PingState): string {
  if (ping.status === "loading") return "检测 qkrpc…";
  if (ping.status === "ok") return "Quicker 已连接";
  return `未连接: ${ping.message}`;
}

export function AppSettingsPanel({
  active,
  activeTab,
  ping,
  onRefreshPing,
  versionRefreshKey,
  focusProviderId,
  disabled = false,
}: AppSettingsPanelProps) {
  const [versionProbeTick, setVersionProbeTick] = useState(0);

  const handleRefreshPing = useCallback(() => {
    setVersionProbeTick((n) => n + 1);
    void onRefreshPing();
  }, [onRefreshPing]);

  const versionKey = (versionRefreshKey ?? 0) + versionProbeTick;
  const tabActive = active;

  return (
    <div className="app-settings-panel">
      <div
        id="app-settings-tab-general"
        role="tabpanel"
        aria-labelledby="app-settings-tab-btn-general"
        hidden={activeTab !== "general"}
        className="app-settings-tab-panel"
      >
        <AccountUsageSection active={tabActive && activeTab === "general"} disabled={disabled} />

        <div className="app-settings-top-grid">
          <section className="app-settings-card">
            <header className="app-settings-section-head app-settings-section-head--compact">
              <h2 className="app-settings-section-title">主题</h2>
            </header>
            <ThemeToggle />
          </section>

          <section className="app-settings-card">
            <header className="app-settings-section-head app-settings-section-head--compact">
              <h2 className="app-settings-section-title">Quicker RPC</h2>
            </header>
            <div className="app-settings-ping-row">
              <div className="app-settings-ping">
                <span
                  className={`ping-dot ${
                    ping.status === "ok"
                      ? "ok"
                      : ping.status === "loading"
                        ? "loading"
                        : "err"
                  }`}
                />
                <span className="app-settings-ping-text">{pingLabel(ping)}</span>
              </div>
              <button
                type="button"
                className="app-settings-action"
                onClick={() => void handleRefreshPing()}
                disabled={disabled || ping.status === "loading"}
              >
                重新检测
              </button>
            </div>
          </section>
        </div>

        <AppVersionSection
          active={tabActive && activeTab === "general"}
          ping={ping}
          versionRefreshKey={versionKey}
        />
      </div>

      <div
        id="app-settings-tab-models"
        role="tabpanel"
        aria-labelledby="app-settings-tab-btn-models"
        hidden={activeTab !== "models"}
        className="app-settings-tab-panel"
      >
        <LlmKeysSettingsSection
          active={tabActive && activeTab === "models"}
          focusProviderId={focusProviderId}
          disabled={disabled}
        />
      </div>

      <div
        id="app-settings-tab-voice"
        role="tabpanel"
        aria-labelledby="app-settings-tab-btn-voice"
        hidden={activeTab !== "voice"}
        className="app-settings-tab-panel"
      >
        <VoiceInputSettingsSection
          active={tabActive && activeTab === "voice"}
          disabled={disabled}
        />
      </div>

      <div
        id="app-settings-tab-launcher"
        role="tabpanel"
        aria-labelledby="app-settings-tab-btn-launcher"
        hidden={activeTab !== "launcher"}
        className="app-settings-tab-panel"
      >
        <LauncherSettingsSection
          active={tabActive && activeTab === "launcher"}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
