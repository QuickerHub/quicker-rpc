"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDevExperienceEnabled } from "@/lib/release-preview.client";
import { isTauriShell, useShellPlatform } from "@/lib/tauri-shell";
import {
  isVoiceInputMockEnabled,
  setVoiceInputMockEnabled,
} from "@/lib/voice-input/voice-input-plugin-status";
import { formatVoiceInputToggleShortcut } from "@/lib/voice-input/voice-input-shortcuts";
import {
  requestDevVoiceRuntimeStart,
  requestDevVoiceRuntimeStop,
} from "@/lib/voice-input/voice-input-dev-runtime";
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
import { requestVoicePluginSetup } from "@/lib/voice-input/voice-plugin-install-flow";
import {
  DEFAULT_VOICE_PLUGIN_SETTINGS,
  downloadVoiceModel,
  fetchVoiceModelInstallState,
  fetchVoicePluginSettings,
  saveVoicePluginSettings,
  voiceModelLabel,
  VOICE_MODEL_OPTIONS,
  type VoiceModelId,
  type VoiceModelInstallState,
  type VoicePluginSettings,
} from "@/lib/voice-input/voice-input-settings";
import type { VoicePluginStatus } from "@/lib/voice-input/voice-input-types";

type VoiceInputSettingsSectionProps = {
  active: boolean;
  disabled?: boolean;
};

type SetupStep = "install" | "start" | "configure";

function statusDotClass(runtimePhase: VoicePluginStatus, hostLoading: boolean): string {
  if (hostLoading || runtimePhase === "downloading") return "loading";
  if (runtimePhase === "running") return "ok";
  if (runtimePhase === "starting") return "loading";
  if (runtimePhase === "error") return "err";
  return "";
}

function resolveSetupStep(panel: VoiceSettingsPanelSnapshot, mockEnabled: boolean): SetupStep {
  if (mockEnabled) return "configure";
  if (!panel.pluginInstalled) return "install";
  if (!panel.runtimeOnline) return "start";
  return "configure";
}

function stepTitle(step: SetupStep): string {
  if (step === "install") return "① 安装 Runtime";
  if (step === "start") return "② 启动服务";
  return "③ 识别配置";
}

function contextHint(params: {
  panel: VoiceSettingsPanelSnapshot;
  step: SetupStep;
  inTauri: boolean;
  mockEnabled: boolean;
}): string | null {
  const { panel, step, inTauri, mockEnabled } = params;
  if (mockEnabled) {
    return "Mock 模式：Composer 点麦克风会填充样例文本。";
  }
  if (panel.runtimePhase === "downloading") {
    return "正在安装语音组件，请稍候…";
  }
  if (step === "install") {
    return inTauri
      ? "先安装本地语音识别 Runtime 与默认模型（约 240 MB，需联网，仅需一次）。"
      : "开发模式：安装 Runtime 与默认模型到本机插件目录，或使用本地 voice-asr-runtime 快速复制。";
  }
  if (step === "start") {
    return inTauri
      ? "Runtime 已安装。启动服务后即可连接并配置识别模型。"
      : "Runtime 已安装。点「启动服务」连接本机 :6016，或手动运行 pnpm voice:dev-server。";
  }
  return "已连接 Runtime。选择模型与加速方式；切换后服务会自动重启。";
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
  const [installBusy, setInstallBusy] = useState(false);
  const [voiceSettings, setVoiceSettings] = useState<VoicePluginSettings>(
    DEFAULT_VOICE_PLUGIN_SETTINGS,
  );
  const [modelInstall, setModelInstall] = useState<VoiceModelInstallState | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [modelDownloadBusy, setModelDownloadBusy] = useState(false);
  const [settingsHint, setSettingsHint] = useState<string | null>(null);
  const devExperienceEnabled = useDevExperienceEnabled();
  const inTauri = isTauriShell();
  const devBrowser = process.env.NODE_ENV === "development" && !inTauri;
  const canManageHost = inTauri || devBrowser;

  const setupStep = resolveSetupStep(panel, mockEnabled);

  const notifyVoiceConfigChanged = useCallback(() => {
    window.dispatchEvent(new Event("voice-input-config-changed"));
  }, []);

  const refreshModelInstallState = useCallback(async () => {
    const state = await fetchVoiceModelInstallState();
    if (state) setModelInstall(state);
  }, []);

  useEffect(() => {
    if (!active) return;
    setMockEnabled(isVoiceInputMockEnabled());
    const onChange = () => setMockEnabled(isVoiceInputMockEnabled());
    window.addEventListener("voice-input-mock-changed", onChange);
    return () => window.removeEventListener("voice-input-mock-changed", onChange);
  }, [active]);

  useEffect(() => {
    if (!active || !canManageHost) return;
    void fetchVoicePluginSettings().then((settings) => {
      if (settings) setVoiceSettings(settings);
    });
    void refreshModelInstallState();
  }, [active, canManageHost, refreshModelInstallState]);

  const persistVoiceSettings = async (
    patch: Partial<VoicePluginSettings>,
    hint?: string,
  ) => {
    if (settingsBusy || disabled || !canManageHost) return;
    const next = { ...voiceSettings, ...patch };
    setVoiceSettings(next);
    setSettingsBusy(true);
    setSettingsHint(null);
    try {
      const saved = await saveVoicePluginSettings(next, {
        restartRuntime: devBrowser && panel.runtimeOnline,
      });
      if (!saved) {
        setSettingsHint("保存失败，请重试");
        return;
      }
      setVoiceSettings(saved);
      setSettingsHint(hint ?? "已保存，语音服务将按新配置重启");
      notifyVoiceConfigChanged();
    } finally {
      setSettingsBusy(false);
    }
  };

  const handleMockToggle = () => {
    setVoiceInputMockEnabled(!mockEnabled);
    notifyVoiceConfigChanged();
  };

  const handleStartRuntime = async () => {
    if (runtimeBusy || disabled || !canManageHost) return;
    setRuntimeBusy(true);
    try {
      if (inTauri) {
        await tauriVoicePluginStartRuntime();
      } else {
        await requestDevVoiceRuntimeStart();
      }
      notifyVoiceConfigChanged();
    } finally {
      setRuntimeBusy(false);
    }
  };

  const handleStopRuntime = async () => {
    if (runtimeBusy || disabled || !canManageHost) return;
    setRuntimeBusy(true);
    try {
      if (inTauri) {
        await tauriVoicePluginStopRuntime();
      } else {
        await requestDevVoiceRuntimeStop();
      }
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

  const handleInstall = () => {
    if (installBusy || disabled) return;
    setInstallBusy(true);
    void requestVoicePluginSetup({ skipConfirm: canManageHost })
      .then(() => notifyVoiceConfigChanged())
      .finally(() => setInstallBusy(false));
  };

  const handleDownloadModel = async (modelId: VoiceModelId) => {
    if (modelDownloadBusy || disabled) return;
    setModelDownloadBusy(true);
    setSettingsHint(null);
    try {
      const result = await downloadVoiceModel(modelId);
      if (!result.ok) {
        setSettingsHint(result.error ?? "模型下载失败");
        return;
      }
      await refreshModelInstallState();
      setSettingsHint("模型下载完成。正在重启语音服务…");
      if (devBrowser) {
        await requestDevVoiceRuntimeStop();
        await new Promise((r) => window.setTimeout(r, 400));
        await requestDevVoiceRuntimeStart();
      } else if (inTauri && panel.runtimeOnline) {
        await tauriVoicePluginStopRuntime();
        await tauriVoicePluginStartRuntime();
      }
      notifyVoiceConfigChanged();
      setSettingsHint("模型已就绪，可切换并使用。");
    } finally {
      setModelDownloadBusy(false);
    }
  };

  const selectedModelInstalled = useMemo(() => {
    const expected =
      VOICE_MODEL_OPTIONS.find((opt) => opt.id === voiceSettings.modelId)
        ?.runtimeModelId ?? "sensevoice";
    if (modelInstall) {
      return voiceSettings.modelId === "lightweight"
        ? modelInstall.lightweight
        : modelInstall.standard;
    }
    if (panel.activeModelId) {
      return panel.activeModelId === expected;
    }
    if (voiceSettings.modelId === "lightweight") return false;
    return panel.pluginInstalled;
  }, [
    modelInstall,
    panel.activeModelId,
    panel.pluginInstalled,
    voiceSettings.modelId,
  ]);

  const canInstall =
    canManageHost
    && !mockEnabled
    && !panel.hostLoading
    && panel.runtimePhase !== "downloading"
    && !panel.pluginInstalled;
  const canStartRuntime =
    canManageHost
    && !mockEnabled
    && panel.pluginInstalled
    && !panel.runtimeOnline
    && panel.runtimePhase !== "downloading";
  const canStopRuntime = canManageHost && !mockEnabled && panel.runtimeOnline;
  const canTestMic = !mockEnabled && panel.runtimeOnline;
  const canConfigure =
    !mockEnabled && panel.runtimePhase === "running" && canManageHost;
  const needsModelDownload =
    canConfigure && !selectedModelInstalled && devBrowser;

  const hint = useMemo(
    () => contextHint({ panel, step: setupStep, inTauri, mockEnabled }),
    [panel, setupStep, inTauri, mockEnabled],
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

      {!mockEnabled && canManageHost ? (
        <div className="voice-settings-steps" aria-label="语音配置步骤">
          <span
            className={`voice-settings-step${setupStep === "install" ? " voice-settings-step--active" : setupStep !== "install" ? " voice-settings-step--done" : ""}`}
          >
            ① 安装
          </span>
          <span className="voice-settings-step-sep" aria-hidden />
          <span
            className={`voice-settings-step${setupStep === "start" ? " voice-settings-step--active" : setupStep === "configure" ? " voice-settings-step--done" : ""}`}
          >
            ② 启动
          </span>
          <span className="voice-settings-step-sep" aria-hidden />
          <span
            className={`voice-settings-step${setupStep === "configure" ? " voice-settings-step--active" : ""}`}
          >
            ③ 配置
          </span>
        </div>
      ) : null}

      <div className="app-settings-ping-row voice-settings-row">
        <div className="app-settings-ping voice-settings-ping">
          <span className={`ping-dot ${statusDotClass(panel.runtimePhase, panel.hostLoading)}`} />
          <span className="app-settings-ping-text">
            <span className="voice-settings-status-label">
              {stepTitle(setupStep)} · {panel.displayLabel}
            </span>
            {panel.displaySubline ? (
              <span className="voice-settings-status-sub">{panel.displaySubline}</span>
            ) : null}
          </span>
        </div>

        <div className="voice-settings-actions">
          {canInstall ? (
            <button
              type="button"
              className="app-settings-action app-settings-action--primary"
              disabled={disabled || installBusy}
              onClick={handleInstall}
            >
              {installBusy ? "安装中…" : "安装 Runtime"}
            </button>
          ) : null}
          {canStartRuntime ? (
            <button
              type="button"
              className="app-settings-action app-settings-action--primary"
              disabled={disabled || runtimeBusy}
              onClick={() => void handleStartRuntime()}
            >
              {runtimeBusy ? "启动中…" : "启动服务"}
            </button>
          ) : null}
          {canStopRuntime ? (
            <button
              type="button"
              className="app-settings-action"
              disabled={disabled || runtimeBusy}
              onClick={() => void handleStopRuntime()}
            >
              {runtimeBusy ? "停止中…" : "停止服务"}
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

      {canConfigure && canManageHost ? (
        <div className="voice-settings-options">
          <label className="voice-settings-field">
            <span className="voice-settings-field-label">识别模型</span>
            <select
              className="voice-settings-select"
              value={voiceSettings.modelId}
              disabled={disabled || settingsBusy || !panel.runtimeOnline}
              onChange={(event) => {
                const modelId = event.target.value as VoiceModelId;
                void persistVoiceSettings(
                  { modelId },
                  panel.runtimeOnline
                    ? "已切换模型，语音服务正在重启…"
                    : "已选择模型，启动服务后生效",
                );
              }}
            >
              {VOICE_MODEL_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}（{opt.sizeHint}）
                </option>
              ))}
            </select>
            <span className="voice-settings-field-hint">
              {VOICE_MODEL_OPTIONS.find((opt) => opt.id === voiceSettings.modelId)
                ?.description}
              {!selectedModelInstalled ? " · 尚未下载此模型" : null}
            </span>
          </label>

          {needsModelDownload ? (
            <button
              type="button"
              className="app-settings-action"
              disabled={disabled || modelDownloadBusy}
              onClick={() => void handleDownloadModel(voiceSettings.modelId)}
            >
              {modelDownloadBusy
                ? "下载中…"
                : `下载${voiceModelLabel(voiceSettings.modelId)}`}
            </button>
          ) : null}

          <label className="voice-settings-mock-toggle voice-settings-gpu-toggle">
            <input
              type="checkbox"
              checked={voiceSettings.gpuAcceleration}
              disabled={disabled || settingsBusy || !panel.runtimeOnline}
              onChange={(event) => {
                void persistVoiceSettings(
                  { gpuAcceleration: event.target.checked },
                  event.target.checked
                    ? "已开启 GPU 加速；若硬件不支持将自动回退 CPU"
                    : "已关闭 GPU 加速，使用 CPU 推理",
                );
              }}
            />
            <span>GPU 加速（Windows 使用 DirectML，不可用时回退 CPU）</span>
          </label>

          {settingsHint ? (
            <p className="voice-settings-hint" role="status">
              {settingsHint}
            </p>
          ) : null}
        </div>
      ) : null}

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
                void requestVoicePluginSetup({
                  force: true,
                  preferNetwork,
                  skipConfirm: true,
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
