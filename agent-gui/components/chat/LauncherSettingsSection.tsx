"use client";

import { useCallback, useEffect, useState } from "react";
import { useShellPlatform } from "@/lib/tauri-shell";
import {
  DEFAULT_LAUNCHER_SHORTCUT,
  isLauncherAutoVoiceEnabled,
  loadLauncherShortcut,
  setLauncherAutoVoiceEnabled,
  storeLauncherShortcut,
} from "@/lib/launcher/launcher-prefs";
import {
  formatTauriShortcutDisplay,
  isValidTauriShortcut,
  keyboardEventToTauriShortcut,
} from "@/lib/launcher/launcher-shortcut-format";
import { syncLauncherGlobalShortcut } from "@/lib/launcher/sync-launcher-global-shortcut";
import { isTauriShell } from "@/lib/tauri-shell";
import { formatVoiceInputToggleShortcut } from "@/lib/voice-input/voice-input-shortcuts";

type LauncherSettingsSectionProps = {
  active: boolean;
  disabled?: boolean;
};

export function LauncherSettingsSection({
  active,
  disabled = false,
}: LauncherSettingsSectionProps) {
  const platform = useShellPlatform();
  const inTauri = isTauriShell();
  const [shortcut, setShortcut] = useState(DEFAULT_LAUNCHER_SHORTCUT);
  const [autoVoice, setAutoVoice] = useState(false);
  const [recording, setRecording] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!active) return;
    setShortcut(loadLauncherShortcut());
    setAutoVoice(isLauncherAutoVoiceEnabled());
  }, [active]);

  const applyShortcut = useCallback(async (next: string) => {
    if (!isValidTauriShortcut(next)) {
      setSyncError("需要至少一个修饰键 + 一个普通键");
      return;
    }
    setShortcut(next);
    storeLauncherShortcut(next);
    if (!inTauri) return;

    setSyncing(true);
    setSyncError(null);
    const result = await syncLauncherGlobalShortcut();
    setSyncing(false);
    if (!result.ok) {
      setSyncError(result.error ?? "注册快捷键失败，可能被其他程序占用");
    }
  }, [inTauri]);

  const handleAutoVoiceChange = (enabled: boolean) => {
    setAutoVoice(enabled);
    setLauncherAutoVoiceEnabled(enabled);
  };

  const handleRecordKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (!recording || disabled) return;
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        setRecording(false);
        return;
      }

      const captured = keyboardEventToTauriShortcut(event.nativeEvent);
      if (!captured) return;

      setRecording(false);
      void applyShortcut(captured);
    },
    [recording, disabled, applyShortcut],
  );

  const handleResetShortcut = () => {
    void applyShortcut(DEFAULT_LAUNCHER_SHORTCUT);
  };

  const shortcutLabel = formatTauriShortcutDisplay(shortcut, platform);

  return (
    <section className="app-settings-card app-settings-card--launcher">
      <header className="app-settings-section-head app-settings-section-head--compact">
        <h2 className="app-settings-section-title">快速输入启动器</h2>
        <p className="app-settings-section-desc">
          全局快捷键唤起透明输入窗；Composer 内语音输入仍为{" "}
          {formatVoiceInputToggleShortcut(platform)}。
        </p>
      </header>

      <div className="launcher-settings-row">
        <div className="launcher-settings-shortcut">
          <span className="launcher-settings-label">启动快捷键</span>
          <div className="launcher-settings-shortcut-controls">
            <button
              type="button"
              className={`launcher-settings-shortcut-btn${
                recording ? " launcher-settings-shortcut-btn--recording" : ""
              }`}
              disabled={disabled || syncing || !inTauri}
              onClick={() => setRecording(true)}
              onKeyDown={handleRecordKeyDown}
              onBlur={() => setRecording(false)}
            >
              {recording ? "按下新快捷键…" : shortcutLabel}
            </button>
            <button
              type="button"
              className="app-settings-action launcher-settings-reset-btn"
              disabled={disabled || syncing || shortcut === DEFAULT_LAUNCHER_SHORTCUT}
              onClick={handleResetShortcut}
            >
              恢复默认
            </button>
          </div>
        </div>

        <label className="launcher-settings-auto-voice">
          <input
            type="checkbox"
            checked={autoVoice}
            disabled={disabled}
            onChange={(event) => handleAutoVoiceChange(event.target.checked)}
          />
          <span className="launcher-settings-auto-voice-text">自动语音输入</span>
          <span className="launcher-settings-auto-voice-hint">
            开启后，用启动快捷键打开时会自动开始录音
          </span>
        </label>
      </div>

      {!inTauri ? (
        <p className="launcher-settings-hint">
          全局快捷键仅在桌面版（Tauri）生效；浏览器开发可用标题栏按钮打开启动器。
        </p>
      ) : null}

      {syncError ? (
        <p className="launcher-settings-error" role="alert">
          {syncError}
        </p>
      ) : null}
    </section>
  );
}
