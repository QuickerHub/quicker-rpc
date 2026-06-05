"use client";

import { useCallback, useEffect, useState } from "react";
import { isTauriShell } from "@/lib/tauri-shell";
import { getVoiceWsPort } from "@/lib/voice-input/voice-input-config";
import { fetchVoiceRuntimeHealth } from "@/lib/voice-input/voice-input-health";
import {
  isVoiceInputMockEnabled,
  setVoiceInputMockEnabled,
  voicePluginStatusLabel,
} from "@/lib/voice-input/voice-input-plugin-status";
import {
  listenVoicePluginInstallProgress,
  tauriVoicePluginInstall,
  tauriVoicePluginStartRuntime,
  tauriVoicePluginStopRuntime,
} from "@/lib/voice-input/voice-input-tauri";
import { useVoicePluginStatus } from "@/lib/voice-input/use-voice-plugin-status";
import { VoiceMicRecorder } from "@/lib/voice-input/voice-input-recorder";
import { transcribePcmViaWebSocket } from "@/lib/voice-input/voice-input-ws-client";

type VoiceInputSettingsSectionProps = {
  active: boolean;
  disabled?: boolean;
};

export function VoiceInputSettingsSection({
  active,
  disabled = false,
}: VoiceInputSettingsSectionProps) {
  const status = useVoicePluginStatus(active);
  const [mockEnabled, setMockEnabled] = useState(false);
  const [healthLine, setHealthLine] = useState<string | null>(null);
  const [hostMessage, setHostMessage] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [runtimeBusy, setRuntimeBusy] = useState(false);
  const [installBusy, setInstallBusy] = useState(false);
  const [installProgress, setInstallProgress] = useState<string | null>(null);
  const isDev = process.env.NODE_ENV === "development";
  const inTauri = isTauriShell();

  const notifyVoiceConfigChanged = () => {
    window.dispatchEvent(new Event("voice-input-config-changed"));
  };

  const refreshHealth = useCallback(async () => {
    if (isVoiceInputMockEnabled()) {
      setHealthLine("mock 模式（不连接 Runtime）");
      return;
    }
    const health = await fetchVoiceRuntimeHealth();
    if (!health) {
      setHealthLine(`未检测到 ws://127.0.0.1:${getVoiceWsPort()}/health`);
      return;
    }
    setHealthLine(
      `Runtime ${health.runtimeVersion ?? "?"} · 模型 ${health.modelId ?? "stub"} · ready=${health.ready ? "是" : "否"}`,
    );
  }, [status]);

  useEffect(() => {
    if (!active) return;
    setMockEnabled(isVoiceInputMockEnabled());
    void refreshHealth();
    const onChange = () => {
      setMockEnabled(isVoiceInputMockEnabled());
      void refreshHealth();
    };
    window.addEventListener("voice-input-mock-changed", onChange);
    window.addEventListener("voice-input-config-changed", onChange);
    return () => {
      window.removeEventListener("voice-input-mock-changed", onChange);
      window.removeEventListener("voice-input-config-changed", onChange);
    };
  }, [active, refreshHealth]);

  const handleMockToggle = () => {
    setVoiceInputMockEnabled(!mockEnabled);
  };

  const handleInstall = async () => {
    if (installBusy || disabled || !inTauri) return;
    setInstallBusy(true);
    setInstallProgress("准备安装…");
    setHostMessage(null);
    let unlisten: (() => void) | undefined;
    try {
      unlisten = await listenVoicePluginInstallProgress((event) => {
        setInstallProgress(event.message || `${event.phase} ${event.percent}%`);
      });
      const dto = await tauriVoicePluginInstall();
      setHostMessage(dto.message);
      notifyVoiceConfigChanged();
      await refreshHealth();
    } catch (err) {
      setHostMessage(err instanceof Error ? err.message : "安装失败");
    } finally {
      await unlisten?.();
      setInstallBusy(false);
      setInstallProgress(null);
    }
  };

  const handleStartRuntime = async () => {
    if (runtimeBusy || disabled || !inTauri) return;
    setRuntimeBusy(true);
    setHostMessage(null);
    try {
      const dto = await tauriVoicePluginStartRuntime();
      setHostMessage(dto.message);
      notifyVoiceConfigChanged();
      await refreshHealth();
    } catch (err) {
      setHostMessage(err instanceof Error ? err.message : "启动失败");
    } finally {
      setRuntimeBusy(false);
    }
  };

  const handleStopRuntime = async () => {
    if (runtimeBusy || disabled || !inTauri) return;
    setRuntimeBusy(true);
    try {
      const dto = await tauriVoicePluginStopRuntime();
      setHostMessage(dto.message);
      notifyVoiceConfigChanged();
      await refreshHealth();
    } catch (err) {
      setHostMessage(err instanceof Error ? err.message : "停止失败");
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
        setTestResult("mock 模式下请在 Composer 点击麦克风测试（会自动填充样例文本）");
        return;
      }
      await recorder.start();
      await new Promise((r) => window.setTimeout(r, 1500));
      const { pcm, recordedMs } = await recorder.stop();
      const result = await transcribePcmViaWebSocket(pcm, {
        language: "zh-CN",
        recordedMs,
      });
      setTestResult(result.text.trim() || "（空结果）");
    } catch (err) {
      setTestResult(err instanceof Error ? err.message : "测试失败");
    } finally {
      recorder.dispose();
      setTesting(false);
    }
  };

  const canInstall =
    inTauri && status === "not_installed" && !mockEnabled && !installBusy;
  const showInstallWizard = canInstall || installBusy;
  const canStartRuntime =
    inTauri &&
    !mockEnabled &&
    (status === "installed" || status === "stopped" || status === "error");
  const canStopRuntime =
    inTauri && !mockEnabled && (status === "running" || status === "starting");

  return (
    <section
      id="voice-input-settings"
      className="app-settings-card app-settings-card--voice"
    >
      <header className="app-settings-section-head">
        <h2 className="app-settings-section-title">本地语音输入</h2>
        <p className="app-settings-section-desc">
          Composer 点击麦克风开始说话，实时写入输入框；再点停止。协议见 docs/voice-input-plugin.md
        </p>
      </header>

      <div className="voice-settings-status-row">
        <span
          className={`ping-dot ${status === "running" ? "ok" : status === "starting" || status === "downloading" ? "loading" : ""}`}
        />
        <span className="voice-settings-status-text">
          状态：{voicePluginStatusLabel(status)}
        </span>
        <button
          type="button"
          className="app-settings-action voice-settings-inline-action"
          disabled={disabled}
          onClick={() => void refreshHealth()}
        >
          重新检测
        </button>
      </div>

      {healthLine ? (
        <p className="voice-settings-hint voice-settings-health">{healthLine}</p>
      ) : null}

      {hostMessage ? (
        <p className="voice-settings-hint" role="status">
          {hostMessage}
        </p>
      ) : null}

      {installProgress ? (
        <p className="voice-settings-hint" role="status">
          {installProgress}
        </p>
      ) : null}

      <div className="voice-settings-actions">
        {showInstallWizard ? (
          <button
            type="button"
            className="app-settings-action"
            disabled={disabled || installBusy}
            onClick={() => void handleInstall()}
          >
            {installBusy ? "安装中…" : "一键安装"}
          </button>
        ) : null}
        {canStartRuntime ? (
          <button
            type="button"
            className="app-settings-action"
            disabled={disabled || runtimeBusy}
            onClick={() => void handleStartRuntime()}
          >
            {runtimeBusy ? "启动中…" : "启动 Runtime"}
          </button>
        ) : null}
        {canStopRuntime ? (
          <button
            type="button"
            className="app-settings-action"
            disabled={disabled || runtimeBusy}
            onClick={() => void handleStopRuntime()}
          >
            {runtimeBusy ? "停止中…" : "停止 Runtime"}
          </button>
        ) : null}
      </div>

      {status === "running" || status === "starting" || mockEnabled ? (
        <p className="voice-settings-hint">
          在聊天输入框点击麦克风开始说话，识别文字会实时写入输入框；再点停止结束。
        </p>
      ) : null}

      {status === "not_installed" && !mockEnabled && !inTauri ? (
        <p className="voice-settings-hint">
          桌面版（Tauri）可在本页一键安装；浏览器开发：<code>start-agent-gui.ps1</code> /{" "}
          <code>pnpm dev</code> 会自动启动语音 Runtime（<code>6016</code>），或手动{" "}
          <code>pnpm voice:dev-server</code>。
        </p>
      ) : null}

      {status === "not_installed" && inTauri && !installBusy ? (
        <p className="voice-settings-hint">
          点击「一键安装」后，应用会优先从 ModelScope 下载识别模型，语音识别服务仍优先使用国内镜像（Bitiful）；模型仅在 ModelScope 不可用时才回退到 Bitiful / GitHub 备用包（约 240 MB，仅安装时需要网络；完成后可离线使用）。
        </p>
      ) : null}

      {isDev ? (
        <>
          <label className="voice-settings-mock-toggle">
            <input
              type="checkbox"
              checked={mockEnabled}
              disabled={disabled}
              onChange={handleMockToggle}
            />
            <span>开发：mock 识别（不连 Runtime，自动填充样例文本，无需说话）</span>
          </label>
          <p className="voice-settings-hint voice-settings-dev-cmd">
            联调 Runtime：仓库根目录{" "}
            <code>cd voice-asr-runtime &amp;&amp; uv run quicker-voice-runtime</code>
            ，或 <code>pnpm voice:dev-server</code>（在 agent-gui 下）。默认使用真实麦克风，仅在勾选
            mock 时自动填充样例。
          </p>
        </>
      ) : null}

      <div className="voice-settings-test-row">
        <button
          type="button"
          className="app-settings-action"
          disabled={disabled || testing || status !== "running" || mockEnabled}
          onClick={() => void handleTestMic()}
        >
          {testing ? "测试中…" : "测试麦克风（约 1.5s）"}
        </button>
        {testResult ? (
          <p className="voice-settings-test-result" role="status">
            {testResult}
          </p>
        ) : null}
      </div>
    </section>
  );
}
