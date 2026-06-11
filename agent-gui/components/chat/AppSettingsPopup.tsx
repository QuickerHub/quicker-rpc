"use client";

import { useEffect, useId, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AppSettingsPanel } from "@/components/chat/AppSettingsPanel";
import {
  APP_SETTINGS_TABS,
  DEFAULT_APP_SETTINGS_TAB,
  type AppSettingsTabId,
} from "@/lib/app-settings-tabs";
import type { LlmProviderId } from "@/lib/llm-providers";
import type { PingState, RefreshPingOptions } from "@/lib/use-qkrpc-ping";

type AppSettingsPopupProps = {
  open: boolean;
  onClose: () => void;
  ping: PingState;
  onRefreshPing: (opts?: RefreshPingOptions) => void | Promise<void>;
  versionRefreshKey?: number;
  focusProviderId?: LlmProviderId;
  initialTab?: AppSettingsTabId;
};

function resolveOpenTab(
  initialTab: AppSettingsTabId | undefined,
  focusProviderId: LlmProviderId | undefined,
): AppSettingsTabId {
  if (initialTab) return initialTab;
  if (focusProviderId) return "models";
  return DEFAULT_APP_SETTINGS_TAB;
}

export function AppSettingsPopup({
  open,
  onClose,
  ping,
  onRefreshPing,
  versionRefreshKey,
  focusProviderId,
  initialTab,
}: AppSettingsPopupProps) {
  const panelId = useId();
  const [activeTab, setActiveTab] = useState<AppSettingsTabId>(DEFAULT_APP_SETTINGS_TAB);

  useLayoutEffect(() => {
    if (!open) return;
    setActiveTab(resolveOpenTab(initialTab, focusProviderId));
  }, [open, initialTab, focusProviderId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const dialog = (
    <div className="app-settings-popup-overlay">
      <button
        type="button"
        className="app-settings-popup-backdrop"
        aria-label="关闭设置"
        onClick={onClose}
      />
      <div
        id={panelId}
        className="app-settings-popup-panel"
        role="dialog"
        aria-modal="true"
        aria-label="设置"
      >
        <div className="app-settings-popup-head">
          <h2 className="app-settings-popup-title">设置</h2>
          <button
            type="button"
            className="app-settings-popup-close"
            aria-label="关闭"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="app-settings-tabs" role="tablist" aria-label="设置分类">
          {APP_SETTINGS_TABS.map((tab) => {
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                id={`app-settings-tab-btn-${tab.id}`}
                role="tab"
                aria-selected={selected}
                aria-controls={`app-settings-tab-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                className={`app-settings-tab${selected ? " app-settings-tab--active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="app-settings-popup-body">
          <AppSettingsPanel
            active
            activeTab={activeTab}
            ping={ping}
            onRefreshPing={onRefreshPing}
            versionRefreshKey={versionRefreshKey}
            focusProviderId={focusProviderId}
            onRequestTab={setActiveTab}
          />
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(dialog, document.body)
    : dialog;
}
