"use client";

import { ThemeToggle } from "@/components/ThemeToggle";
import { LlmKeysSettingsSection } from "@/components/chat/LlmKeysSettingsSection";
import type { LlmProviderId } from "@/lib/llm-providers";
import type { PingState } from "@/lib/use-qkrpc-ping";

type AppSettingsPanelProps = {
  active: boolean;
  ping: PingState;
  onRefreshPing: () => void;
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
  focusProviderId,
  disabled = false,
}: AppSettingsPanelProps) {
  return (
    <main className="app-settings-page" aria-label="设置">
      <div className="app-settings-page-inner">
        <section className="app-settings-section-block">
          <header className="app-settings-section-head">
            <h2 className="app-settings-section-title">主题</h2>
          </header>
          <ThemeToggle />
        </section>

        <LlmKeysSettingsSection
          active={active}
          focusProviderId={focusProviderId}
          disabled={disabled}
        />

        <section className="app-settings-section-block">
          <header className="app-settings-section-head">
            <h2 className="app-settings-section-title">Quicker RPC</h2>
          </header>
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
            onClick={() => void onRefreshPing()}
            disabled={disabled || ping.status === "loading"}
          >
            重新检测
          </button>
        </section>
      </div>
    </main>
  );
}
