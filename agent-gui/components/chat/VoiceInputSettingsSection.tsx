"use client";

import { useEffect, useMemo, useState } from "react";
import { useDevExperienceEnabled } from "@/lib/release-preview.client";
import { isTauriShell, useShellPlatform } from "@/lib/tauri-shell";
import {
  isVoiceInputMockEnabled,
  setVoiceInputMockEnabled,
} from "@/lib/voice-input/voice-input-plugin-status";
import { formatVoiceInputToggleShortcut } from "@/lib/voice-input/voice-input-shortcuts";
import { devVoicePluginInstall } from "@/lib/voice-input/voice-input-dev-install";
import {
  tauriVoicePluginStartRuntime,
  tauriVoicePluginStopRuntime,
} from "@/lib/voice-input/voice-input-tauri";
import {
  useVoiceSettingsPanelState,
  type VoiceSettingsPanelSnapshot,
} from "@/lib/voice-input/use-voice-settings-panel-state";
import { VoiceMicRecorder } from "@/lib/voice-input/voice-input-recorder";
import { transcribePcmViaWebSocket } from "@/lib/voice-input/voice-input-ws-client";
import type { VoicePluginStatus } from "@/lib/voice-input/voice-input-types";

type VoiceInputSettingsSectionProps = {
  active: boolean;
  disabled?: boolean;
};

function statusDotClass(runtimePhase: VoicePluginStatus, hostLoading: boolean): string {
  if (hostLoading || runtimePhase === "downloading") return "loading";
  if (runtimePhase === "running") return "ok";
  if (runtimePhase === "starting") return "loading";
  if (runtimePhase === "error") return "err";
  return "";
}

function contextHint(params: {
  panel: VoiceSettingsPanelSnapshot;
  inTauri: boolean;
  mockEnabled: boolean;
}): string | null {
  const { panel, inTauri, mockEnabled } = params;
  if (mockEnabled) {
    return "Mock 模式：Composer 点麦克风会填充样例文本。";
  }
  if (panel.runtimePhase === "downloading") {
    return "正在安装，右下角可查看进度。";
  }
  if (!panel.pluginInstalled) {
    if (panel.runtimeOnline) {
      return inTauri
        ? "当前由外部 Runtime 提供服务。点 Composer 麦克风可安装离线组件。"
        : "当前由 dev Runtime 提供服务。点 Composer 麦克风可测试安装流程。";
    }
    return "点 Composer 麦克风即可安装（约 240 MB，需联网）。";
  }
  if (panel.runtimePhase === "installed" || panel.runtimePhase === "stopped") {
    return "插件已安装；点 Composer 麦克风可启动并使用。";
  }
  if (panel.runtimePhase === "error") {
    return panel.hostStatus?.message ?? "语音服务异常，可尝试重新启动。";
  }
  return null;
}

export function VoiceInputSettingsSection({
  active,
  disabled = false,
}: VoiceInputSettingsSectionProps) {
  const platform = useShellPlatform();
  const panel = useVoiceSettingsPanelState(active);
  const [mockEnabled, setMockEnabled] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [runtimeBusy, setRuntimeBusy] = useState(false);
  const [reinstallBusy, setReinstallBusy] = useState(false);
  const [preferNetwork, setPreferNetwork] = useState(false);
  const devExperienceEnabled = useDevExperienceEnabled();
  const inTauri = isTauriShell();

  const notifyVoiceConfigChanged = () => {
    window.dispatchEvent(new Event("voice-input-config-changed"));
  };

  useEffect(() => {
    if (!active) return;
    setMockEnabled(isVoiceInputMockEnabled());
    const onChange = () => setMockEnabled(isVoiceInputMockEnabled());
    window.addEventListener("voice-input-mock-changed", onChange);
    return () => window.removeEventListener("voice-input-mock-changed", onChange);
  }, [active]);

  const handleMockToggle = () => {
    setVoiceInputMockEnabled(!mockEnabled);
    notifyVoiceConfigChanged();
  };

  const handleStartRuntime = async () => {
    if (runtimeBusy || disabled || !inTauri) return;
    setRuntimeBusy(true);
    try {
      await tauriVoicePluginStartRuntime();
      notifyVoiceConfigChanged();
    } finally {
      setRuntimeBusy(false);
    }
  };

  const handleStopRuntime = async () => {
    if (runtimeBusy || disabled || !inTauri) return;
    setRuntimeBusy(true);
    try {
      await tauriVoicePluginStopRuntime();
      notifyVoiceConfigChanged();
    } finally {
      setRuntimeBusy(false);
    }
  };

  const handleTestMic = async () => {
    if (testing || disabled) return;
    setTesting(true);
    setTestResult(null);
    const recorder = new VoiceMicRecorder();
    try {
      if (isVoiceInputMockEnabled()) {
        setTestResult("请在 Composer 点麦克风测试 mock 识别。");
        return;
      }
      await recorder.start();
      await new Promise((r) => window.setTimeout(r, 1500));
      const { pcm, durationMs } = await recorder.stop();
      const result = await transcribePcmViaWebSocket(pcm, {
        language: "zh-CN",
        recordedMs: durationMs,
      });
      setTestResult(result.text.trim() || "（空结果）");
    } catch (err) {
      setTestResult(err instanceof Error ? err.message : "测试失败");
    } finally {
      recorder.dispose();
      setTesting(false);
    }
  };

  const canStartRuntime =
    inTauri
    && !mockEnabled
    && panel.pluginInstalled
    && (panel.runtimePhase === "installed"
      || panel.runtimePhase === "stopped"
      || panel.runtimePhase === "error");
  const canStopRuntime = inTauri && !mockEnabled && panel.runtimeOnline;
  const canTestMic = !mockEnabled && panel.runtimeOnline;

  const hint = useMemo(
    () => contextHint({ panel, inTauri, mockEnabled }),
    [panel, inTauri, mockEnabled],
  );

  return (
    <section
      id="voice-input-settings"
      className="app-settings-card app-settings-card--voice"
    >
      <header className="app-settings-section-head app-settings-section-head--compact">
        <h2 className="app-settings-section-title">本地语音输入</h2>
        <p className="app-settings-section-desc">
          Composer 内按 {formatVoiceInputToggleShortcut(platform)} 或点麦克风说话，文字实时写入输入框。
        </p>
      </header>

      <div className="app-settings-ping-row voice-settings-row">
        <div className="app-settings-ping voice-settings-ping">
          <span className={`ping-dot ${statusDotClass(panel.runtimePhase, panel.hostLoading)}`} />
          <span className="app-settings-ping-text">
            <span className="voice-settings-status-label">{panel.displayLabel}</span>
            {panel.displaySubline ? (
              <span className="voice-settings-status-sub">{panel.displaySubline}</span>
            ) : null}
          </span>
        </div>

        <div className="voice-settings-actions">
          {canStartRuntime ? (
            <button
              type="button"
              className="app-settings-action"
              disabled={disabled || runtimeBusy}
              onClick={() => void handleStartRuntime()}
            >
              {runtimeBusy ? "启动中…" : "启动"}
            </button>
          ) : null}
          {canStopRuntime ? (
            <button
              type="button"
              className="app-settings-action"
              disabled={disabled || runtimeBusy}
              onClick={() => void handleStopRuntime()}
            >
              {runtimeBusy ? "停止中…" : "停止"}
            </button>
          ) : null}
          {canTestMic ? (
            <button
              type="button"
              className="app-settings-action"
              disabled={disabled || testing}
              onClick={() => void handleTestMic()}
            >
              {testing ? "测试中…" : "测试麦克风"}
            </button>
          ) : null}
          <button
            type="button"
            className="app-settings-action"
            disabled={disabled}
            onClick={() => notifyVoiceConfigChanged()}
          >
            重新检测
          </button>
        </div>
      </div>

      {hint ? <p className="voice-settings-hint">{hint}</p> : null}

      {testResult ? (
        <p className="voice-settings-test-result" role="status">
          识别结果：{testResult}
        </p>
      ) : null}

      {devExperienceEnabled ? (
        <details className="voice-settings-dev">
          <summary>开发者选项</summary>
          <label className="voice-settings-mock-toggle">
            <input
              type="checkbox"
              checked={mockEnabled}
              disabled={disabled}
              onChange={handleMockToggle}
            />
            <span>Mock 识别（不连 Runtime）</span>
          </label>
          <label className="voice-settings-mock-toggle">
            <input
              type="checkbox"
              checked={preferNetwork}
              disabled={disabled || reinstallBusy}
              onChange={(event) => setPreferNetwork(event.target.checked)}
            />
            <span>强制网络下载（跳过本地 voice-asr-runtime 复制）</span>
          </label>
          {panel.pluginInstalled ? (
            <button
              type="button"
              className="app-settings-action"
              disabled={disabled || reinstallBusy}
              onClick={() => {
                if (reinstallBusy || disabled) return;
                setReinstallBusy(true);
                void devVoicePluginInstall({
                  force: true,
                  preferNetwork,
                })
                  .then(() => notifyVoiceConfigChanged())
                  .finally(() => setReinstallBusy(false));
              }}
            >
              {reinstallBusy ? "安装中…" : "重新安装"}
            </button>
          ) : null}
          {panel.hostStatus?.pluginDir ? (
            <p className="voice-settings-hint">
              插件目录：<code>{panel.hostStatus.pluginDir}</code>
            </p>
          ) : null}
          <p className="voice-settings-hint">
            联调 Runtime：<code>pnpm voice:dev-server</code>
          </p>
        </details>
      ) : null}
    </section>
  );
}
