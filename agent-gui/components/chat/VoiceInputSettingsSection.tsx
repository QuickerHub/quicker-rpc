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
  type VoiceRuntimeMeta,
  type VoiceSettingsPanelSnapshot,
} from "@/lib/voice-input/use-voice-settings-panel-state";
import { VoiceMicRecorder } from "@/lib/voice-input/voice-input-recorder";
import { transcribePcmViaWebSocket } from "@/lib/voice-input/voice-input-ws-client";
import { requestVoicePluginSetup } from "@/lib/voice-input/voice-plugin-install-flow";
import {
  DEFAULT_VOICE_PLUGIN_SETTINGS,
  downloadVoiceModel,
  executionProviderLabel,
  fetchVoiceModelInstallState,
  fetchVoicePluginSettings,
  saveVoicePluginSettings,
  voiceModelLabel,
  VOICE_MODEL_OPTIONS,
  type VoiceModelDownloadProgress,
  type VoiceModelId,
  type VoiceModelInstallState,
  type VoicePluginSettings,
} from "@/lib/voice-input/voice-input-settings";
import type { VoicePluginStatus } from "@/lib/voice-input/voice-input-types";
import {
  applyPluginUpdate,
  fetchPluginStatus,
  pluginRegistryRefresh,
  type PluginStatusDto,
} from "@/lib/plugin-runtime-client";

type VoiceInputSettingsSectionProps = {
  active: boolean;
  disabled?: boolean;
};

type SetupStep = "install" | "start" | "configure";

const SETUP_STEPS: ReadonlyArray<{ id: SetupStep; label: string }> = [
  { id: "install", label: "安装" },
  { id: "start", label: "启动" },
  { id: "configure", label: "配置" },
];

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

function stepIndex(step: SetupStep): number {
  return SETUP_STEPS.findIndex((item) => item.id === step);
}

function contextHint(params: {
  panel: VoiceSettingsPanelSnapshot;
  step: SetupStep;
  inTauri: boolean;
  mockEnabled: boolean;
}): string | null {
  const { panel, step, inTauri, mockEnabled } = params;
  if (mockEnabled) return "Mock 模式：Composer 点麦克风会填充样例文本。";
  if (panel.runtimePhase === "downloading") return "正在安装语音组件，请稍候…";
  if (step === "install") {
    return inTauri
      ? "安装本地 Runtime 与默认模型（约 240 MB，需联网，仅需一次）。"
      : "安装到本机插件目录；开发环境可优先使用仓库内 voice-asr-runtime 快速复制。";
  }
  if (step === "start") {
    return inTauri
      ? "启动后即可连接本机语音识别服务并选择模型。"
      : "启动本机 :6016 服务，或运行 pnpm voice:dev-server。";
  }
  return null;
}

function runtimeStatusMessage(
  panel: VoiceSettingsPanelSnapshot,
  meta: VoiceRuntimeMeta | null,
): string {
  if (panel.hostLoading) return "正在检测语音服务…";
  if (panel.runtimePhase === "downloading") {
    return panel.hostStatus?.message ?? "正在下载安装包…";
  }
  if (meta?.connected) return "语音识别服务已连接，可在 Composer 使用麦克风。";
  if (meta?.starting) return "服务启动中，模型加载可能需要数十秒…";
  if (meta?.disconnectedMessage) return meta.disconnectedMessage;
  if (panel.runtimePhase === "error") {
    return panel.hostStatus?.message ?? panel.runtimeDetail ?? "语音服务异常";
  }
  if (panel.pluginInstalled) return "Runtime 已安装，请启动服务。";
  return "尚未安装本地语音组件。";
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
  const [modelDownloadProgress, setModelDownloadProgress] =
    useState<VoiceModelDownloadProgress | null>(null);
  const [settingsHint, setSettingsHint] = useState<string | null>(null);
  const [pluginGalleryStatus, setPluginGalleryStatus] =
    useState<PluginStatusDto | null>(null);
  const [pluginUpdateBusy, setPluginUpdateBusy] = useState(false);
  const devExperienceEnabled = useDevExperienceEnabled();
  const inTauri = isTauriShell();
  const devBrowser = process.env.NODE_ENV === "development" && !inTauri;
  const canManageHost = inTauri || devBrowser;

  const setupStep = resolveSetupStep(panel, mockEnabled);
  const currentStepIndex = stepIndex(setupStep);
  const meta = panel.runtimeMeta;

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
      setSettingsHint(hint ?? "设置已保存，语音服务将按新配置重启");
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
      if (inTauri) await tauriVoicePluginStartRuntime();
      else await requestDevVoiceRuntimeStart();
      notifyVoiceConfigChanged();
    } finally {
      setRuntimeBusy(false);
    }
  };

  const handleCheckPluginUpdate = async () => {
    if (pluginUpdateBusy || disabled || !inTauri) return;
    setPluginUpdateBusy(true);
    setSettingsHint(null);
    try {
      await pluginRegistryRefresh();
      const status = await fetchPluginStatus("voice-asr");
      setPluginGalleryStatus(status);
      if (!status) {
        setSettingsHint("无法获取插件更新信息");
        return;
      }
      if (!status.hostCompatible) {
        setSettingsHint(status.message ?? "请升级 QuickerAgent 后再更新语音 Runtime");
        return;
      }
      if (status.updateAvailable) {
        setSettingsHint(
          status.message ?? `发现新版本 ${status.latestVersion ?? ""}`,
        );
      } else {
        setSettingsHint(
          status.installedVersion
            ? `已是最新 Runtime（${status.installedVersion}）`
            : "当前无可用 Runtime 更新",
        );
      }
    } finally {
      setPluginUpdateBusy(false);
    }
  };

  const handleApplyPluginUpdate = async () => {
    if (pluginUpdateBusy || disabled || !inTauri) return;
    setPluginUpdateBusy(true);
    setSettingsHint(null);
    try {
      const status = await applyPluginUpdate("voice-asr");
      setPluginGalleryStatus(status);
      setSettingsHint(status?.message ?? "语音 Runtime 更新完成");
      notifyVoiceConfigChanged();
    } catch (err) {
      setSettingsHint(err instanceof Error ? err.message : "插件更新失败");
    } finally {
      setPluginUpdateBusy(false);
    }
  };

  const handleStopRuntime = async () => {
    if (runtimeBusy || disabled || !canManageHost) return;
    setRuntimeBusy(true);
    try {
      if (inTauri) await tauriVoicePluginStopRuntime();
      else await requestDevVoiceRuntimeStop();
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

  const modelInstalledById = useCallback(
    (modelId: VoiceModelId): boolean => {
      if (modelInstall) {
        return modelId === "lightweight"
          ? modelInstall.lightweight
          : modelInstall.standard;
      }
      const expected =
        VOICE_MODEL_OPTIONS.find((opt) => opt.id === modelId)?.runtimeModelId
        ?? "sensevoice";
      if (panel.activeModelId) return panel.activeModelId === expected;
      if (modelId === "lightweight") return false;
      return panel.pluginInstalled;
    },
    [modelInstall, panel.activeModelId, panel.pluginInstalled],
  );

  const modelPartialById = useCallback(
    (modelId: VoiceModelId): boolean => {
      if (!modelInstall) return false;
      return modelId === "lightweight"
        ? modelInstall.lightweightPartial
        : modelInstall.standardPartial;
    },
    [modelInstall],
  );

  const selectedModelInstalled = modelInstalledById(voiceSettings.modelId);
  const selectedModelPartial = modelPartialById(voiceSettings.modelId);

  const handleDownloadModel = async (
    modelId: VoiceModelId,
    options?: { force?: boolean },
  ) => {
    if (modelDownloadBusy || disabled) return;
    await refreshModelInstallState();
    const latest = await fetchVoiceModelInstallState();
    const installed = latest
      ? modelId === "lightweight"
        ? latest.lightweight
        : latest.standard
      : modelInstalledById(modelId);
    const partial = latest
      ? modelId === "lightweight"
        ? latest.lightweightPartial
        : latest.standardPartial
      : modelPartialById(modelId);
    const force = options?.force === true || partial || !installed;
    setModelDownloadBusy(true);
    setModelDownloadProgress({
      phase: "prepare",
      percent: 0,
      message: force ? "准备重新下载模型…" : "准备下载模型…",
    });
    setSettingsHint(null);
    let succeeded = false;
    try {
      if (devBrowser && panel.runtimeOnline) {
        await requestDevVoiceRuntimeStop();
        await new Promise((r) => window.setTimeout(r, 400));
      } else if (inTauri && panel.runtimeOnline) {
        await tauriVoicePluginStopRuntime();
        await new Promise((r) => window.setTimeout(r, 400));
      }

      const result = await downloadVoiceModel(
        modelId,
        setModelDownloadProgress,
        { force },
      );
      if (!result.ok) {
        setModelDownloadProgress({
          phase: "error",
          percent: 0,
          message: result.error ?? "模型下载失败",
        });
        setSettingsHint(result.error ?? "模型下载失败");
        return;
      }
      await refreshModelInstallState();
      if (devBrowser) {
        await requestDevVoiceRuntimeStart();
      } else if (inTauri && panel.runtimeOnline) {
        await tauriVoicePluginStartRuntime();
      }
      notifyVoiceConfigChanged();
      setSettingsHint("模型已就绪。");
      succeeded = true;
    } finally {
      setModelDownloadBusy(false);
      if (succeeded) {
        setModelDownloadProgress(null);
      }
      void refreshModelInstallState();
    }
  };

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
  const showModelSettings =
    canManageHost
    && !mockEnabled
    && panel.pluginInstalled
    && panel.runtimePhase !== "downloading"
    && setupStep !== "install";
  const needsModelDownload =
    showModelSettings && (!selectedModelInstalled || selectedModelPartial);
  const canRedownloadModel =
    showModelSettings && selectedModelInstalled && !modelDownloadBusy;

  const hint = useMemo(
    () => contextHint({ panel, step: setupStep, inTauri, mockEnabled }),
    [panel, setupStep, inTauri, mockEnabled],
  );

  const statusMessage = runtimeStatusMessage(panel, meta);

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
        <VoiceSetupStepper currentIndex={currentStepIndex} />
      ) : null}

      <div className="voice-settings-status-card">
        <div className="voice-settings-status-head">
          <div className="voice-settings-status-main">
            <span
              className={`ping-dot voice-settings-status-dot ${statusDotClass(panel.runtimePhase, panel.hostLoading)}`}
            />
            <div className="voice-settings-status-text">
              <span className="voice-settings-status-title">{panel.displayLabel}</span>
              <span className="voice-settings-status-message">{statusMessage}</span>
            </div>
          </div>
          {meta?.connected ? (
            <VoiceRuntimeMetaChips meta={meta} />
          ) : null}
        </div>

        {hint ? <p className="voice-settings-status-hint">{hint}</p> : null}

        <div className="voice-settings-toolbar">
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
            className="app-settings-action voice-settings-action-muted"
            disabled={disabled}
            onClick={() => notifyVoiceConfigChanged()}
          >
            重新检测
          </button>
          {inTauri ? (
            <button
              type="button"
              className="app-settings-action voice-settings-action-muted"
              disabled={disabled || pluginUpdateBusy}
              onClick={() => void handleCheckPluginUpdate()}
            >
              {pluginUpdateBusy ? "检查中…" : "检查插件更新"}
            </button>
          ) : null}
          {inTauri && pluginGalleryStatus?.updateAvailable ? (
            <button
              type="button"
              className="app-settings-action app-settings-action--primary"
              disabled={disabled || pluginUpdateBusy}
              onClick={() => void handleApplyPluginUpdate()}
            >
              {pluginUpdateBusy ? "更新中…" : "安装 Runtime 更新"}
            </button>
          ) : null}
        </div>
      </div>

      {showModelSettings ? (
        <div className="voice-settings-panel">
          <h3 className="voice-settings-panel-title">识别配置</h3>

          <div className="voice-settings-model-grid">
            {VOICE_MODEL_OPTIONS.map((opt) => {
              const selected = voiceSettings.modelId === opt.id;
              const installed = modelInstalledById(opt.id);
              const partial = modelPartialById(opt.id);
              return (
                <div
                  key={opt.id}
                  className={`voice-settings-model-card${selected ? " voice-settings-model-card--selected" : ""}`}
                >
                  <button
                    type="button"
                    className="voice-settings-model-card-main"
                    disabled={disabled || settingsBusy}
                    onClick={() => {
                      if (selected) return;
                      void persistVoiceSettings(
                        { modelId: opt.id },
                        "已切换模型，语音服务正在重启…",
                      );
                    }}
                  >
                    <span className="voice-settings-model-card-head">
                      <span className="voice-settings-model-card-title">{opt.label}</span>
                      <span className="voice-settings-model-card-size">{opt.sizeHint}</span>
                    </span>
                    <span className="voice-settings-model-card-desc">{opt.description}</span>
                    <span className="voice-settings-model-card-foot">
                      {installed ? (
                        <span className="voice-settings-badge voice-settings-badge--ok">已安装</span>
                      ) : partial ? (
                        <span className="voice-settings-badge voice-settings-badge--warn">不完整</span>
                      ) : (
                        <span className="voice-settings-badge">未下载</span>
                      )}
                      {selected ? (
                        <span className="voice-settings-badge voice-settings-badge--accent">使用中</span>
                      ) : null}
                    </span>
                  </button>
                  {canManageHost && (installed || partial) && !modelDownloadBusy ? (
                    <button
                      type="button"
                      className="voice-settings-model-redownload"
                      disabled={disabled || modelDownloadBusy}
                      onClick={() => void handleDownloadModel(opt.id, { force: true })}
                    >
                      重新下载
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>

          {needsModelDownload && !modelDownloadBusy ? (
            <button
              type="button"
              className="app-settings-action voice-settings-download-btn"
              disabled={disabled}
              onClick={() => void handleDownloadModel(voiceSettings.modelId, {
                force: selectedModelPartial || !selectedModelInstalled,
              })}
            >
              {selectedModelPartial
                ? `修复 ${voiceModelLabel(voiceSettings.modelId)}`
                : `下载 ${voiceModelLabel(voiceSettings.modelId)}`}
            </button>
          ) : null}

          {canRedownloadModel ? (
            <button
              type="button"
              className="app-settings-action voice-settings-action-muted"
              disabled={disabled || modelDownloadBusy}
              onClick={() => void handleDownloadModel(voiceSettings.modelId, { force: true })}
            >
              重新下载当前模型
            </button>
          ) : null}

          {modelDownloadProgress ? (
            <VoiceModelDownloadProgressBar progress={modelDownloadProgress} />
          ) : null}

          {canConfigure ? (
            <div className="voice-settings-toggle-row">
              <div className="voice-settings-toggle-copy">
                <span className="voice-settings-toggle-title">GPU 加速</span>
                <span className="voice-settings-toggle-desc">
                  Windows 使用 DirectML；硬件不支持时自动回退 CPU
                </span>
              </div>
              <label className="voice-settings-switch">
                <input
                  type="checkbox"
                  checked={voiceSettings.gpuAcceleration}
                  disabled={disabled || settingsBusy}
                  onChange={(event) => {
                    void persistVoiceSettings(
                      { gpuAcceleration: event.target.checked },
                      event.target.checked
                        ? "已开启 GPU 加速"
                        : "已关闭 GPU 加速",
                    );
                  }}
                />
                <span className="voice-settings-switch-track" aria-hidden />
              </label>
            </div>
          ) : null}
        </div>
      ) : null}

      {settingsHint ? (
        <p className="voice-settings-banner" role="status">
          {settingsHint}
        </p>
      ) : null}

      {testResult ? (
        <blockquote className="voice-settings-test-quote" role="status">
          <span className="voice-settings-test-quote-label">识别结果</span>
          {testResult}
        </blockquote>
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

function VoiceSetupStepper({ currentIndex }: { currentIndex: number }) {
  return (
    <ol className="voice-settings-stepper" aria-label="配置步骤">
      {SETUP_STEPS.map((step, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li
            key={step.id}
            className={`voice-settings-stepper-item${active ? " voice-settings-stepper-item--active" : ""}${done ? " voice-settings-stepper-item--done" : ""}`}
            aria-current={active ? "step" : undefined}
          >
            <span className="voice-settings-stepper-marker" aria-hidden>
              {done ? "✓" : index + 1}
            </span>
            <span className="voice-settings-stepper-label">{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function VoiceRuntimeMetaChips({ meta }: { meta: VoiceRuntimeMeta }) {
  const chips: string[] = [];
  if (meta.version) chips.push(`v${meta.version}`);
  if (meta.modelId) chips.push(meta.modelId);
  if (meta.executionProvider) {
    chips.push(executionProviderLabel(meta.executionProvider));
  }
  if (chips.length === 0) return null;
  return (
    <div className="voice-settings-meta-chips">
      {chips.map((chip) => (
        <span key={chip} className="voice-settings-meta-chip">
          {chip}
        </span>
      ))}
    </div>
  );
}

function VoiceModelDownloadProgressBar({
  progress,
}: {
  progress: VoiceModelDownloadProgress;
}) {
  const isError = progress.phase === "error";
  const indeterminate = !isError && progress.percent <= 0;
  const pctLabel = indeterminate ? "…" : `${progress.percent}%`;

  return (
    <div
      className={`voice-settings-install-progress${isError ? " voice-settings-install-progress--error" : ""}`}
      role="status"
      aria-live="polite"
      aria-valuenow={indeterminate ? undefined : progress.percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="voice-settings-install-progress-head">
        <span className="voice-settings-install-progress-title">正在下载模型</span>
        <span className="voice-settings-install-progress-pct">{pctLabel}</span>
      </div>
      <div className="voice-settings-progress-track">
        <div
          className={`voice-settings-progress-fill${indeterminate ? " voice-settings-progress-fill--indeterminate" : ""}`}
          style={indeterminate ? undefined : { width: `${progress.percent}%` }}
        />
      </div>
      <p className="voice-settings-install-progress-msg">{progress.message}</p>
    </div>
  );
}
