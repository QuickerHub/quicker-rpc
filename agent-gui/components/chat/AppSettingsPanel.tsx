"use client";

import { useCallback, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AppVersionSection } from "@/components/chat/AppVersionSection";
import { LlmKeysSettingsSection } from "@/components/chat/LlmKeysSettingsSection";
import type { LlmProviderId } from "@/lib/llm-providers";
import type { PingState } from "@/lib/use-qkrpc-ping";

type AppSettingsPanelProps = {
  active: boolean;
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

  return (
    <div className="app-settings-panel">
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

        <LlmKeysSettingsSection
          active={active}
          focusProviderId={focusProviderId}
          disabled={disabled}
        />

        <AppVersionSection
          active={active}
          ping={ping}
          versionRefreshKey={versionKey}
        />
    </div>
  );
}
