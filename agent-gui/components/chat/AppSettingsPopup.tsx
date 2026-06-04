"use client";

import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { AppSettingsPanel } from "@/components/chat/AppSettingsPanel";
import type { LlmProviderId } from "@/lib/llm-providers";
import type { PingState } from "@/lib/use-qkrpc-ping";

type AppSettingsPopupProps = {
  open: boolean;
  onClose: () => void;
  ping: PingState;
  onRefreshPing: () => void;
  versionRefreshKey?: number;
  focusProviderId?: LlmProviderId;
};

export function AppSettingsPopup({
  open,
  onClose,
  ping,
  onRefreshPing,
  versionRefreshKey,
  focusProviderId,
}: AppSettingsPopupProps) {
  const panelId = useId();

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
        <div className="app-settings-popup-body">
          <AppSettingsPanel
            active
            ping={ping}
            onRefreshPing={onRefreshPing}
            versionRefreshKey={versionRefreshKey}
            focusProviderId={focusProviderId}
          />
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(dialog, document.body)
    : dialog;
}
