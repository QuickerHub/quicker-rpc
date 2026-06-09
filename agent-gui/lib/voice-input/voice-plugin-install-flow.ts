"use client";

import { appConfirm } from "@/lib/app-confirm";
import { dismissAppMessage, pushAppMessage } from "@/lib/app-messages";
import { isTauriShell } from "@/lib/tauri-shell";
import {
  devVoicePluginInstall,
  fetchDevVoicePluginHostStatusForInstall,
  invalidateDevVoicePluginHostStatusCache,
} from "@/lib/voice-input/voice-input-dev-install";
import { requestDevVoiceRuntimeStart } from "@/lib/voice-input/voice-input-dev-runtime";
import { fetchVoiceRuntimeHealth } from "@/lib/voice-input/voice-input-health";
import { getVoiceWsPort } from "@/lib/voice-input/voice-input-config";
import {
  fetchTauriVoicePluginStatus,
  listenVoicePluginInstallProgress,
  tauriVoicePluginInstall,
  tauriVoicePluginStartRuntime,
  type TauriVoicePluginStatusDto,
  type VoiceInstallProgressEvent,
} from "@/lib/voice-input/voice-input-tauri";
import type { VoicePluginStatus } from "@/lib/voice-input/voice-input-types";

const VOICE_INSTALL_PROGRESS_ID = "voice-plugin-install-progress";
const VOICE_INSTALL_RESULT_ID = "voice-plugin-install-result";

type InstallProgress = {
  percent: number;
  message: string;
};

export type VoicePluginInstallFlowOptions = {
  /** Skip install confirm dialog (e.g. /tool-test). */
  skipConfirm?: boolean;
  /** Re-run install even when plugin/runtime looks ready. */
  force?: boolean;
  /** Dev browser: prefer network download over local copy. */
  preferNetwork?: boolean;
};

let installPromise: Promise<boolean> | null = null;

function normalizeProgress(event: {
  percent?: number;
  message?: string;
  phase?: string;
}): InstallProgress {
  const percent = Math.max(0, Math.min(100, Math.round(event.percent ?? 0)));
  const message =
    event.message?.trim()
    || `${event.phase ?? "install"} ${percent}%`;
  return { percent, message };
}

function notifyVoiceConfigChanged(): void {
  invalidateDevVoicePluginHostStatusCache();
  window.dispatchEvent(new Event("voice-input-config-changed"));
}

function showInstallProgress(progress: InstallProgress): void {
  pushAppMessage({
    id: VOICE_INSTALL_PROGRESS_ID,
    kind: "info",
    title: "正在安装语音输入",
    body: progress.message,
    progress,
  });
}

function hideInstallProgress(): void {
  dismissAppMessage(VOICE_INSTALL_PROGRESS_ID);
}

function showInstallSuccess(body: string): void {
  pushAppMessage({
    id: VOICE_INSTALL_RESULT_ID,
    kind: "success",
    title: "语音输入",
    body,
    autoDismissMs: 6_000,
  });
}

function showInstallError(message: string): void {
  pushAppMessage({
    id: VOICE_INSTALL_RESULT_ID,
    kind: "error",
    title: "语音输入",
    body: message,
    autoDismissMs: 10_000,
  });
}

async function fetchHostStatus(): Promise<TauriVoicePluginStatusDto | null> {
  const tauriDto = await fetchTauriVoicePluginStatus();
  if (tauriDto) return tauriDto;

  if (process.env.NODE_ENV !== "development") return null;

  const body = await fetchDevVoicePluginHostStatusForInstall();
  if (!body) return null;

  if (body.progress) {
    showInstallProgress(normalizeProgress(body.progress));
  }
  const { progress: _progress, ...dto } = body;
  return dto;
}

async function isRuntimeReady(): Promise<boolean> {
  const health = await fetchVoiceRuntimeHealth(getVoiceWsPort());
  return health?.ready === true;
}

function isCaptureReadyStatus(status: VoicePluginStatus): boolean {
  return status === "running" || status === "starting";
}

async function waitForHostReady(
  onProgress?: (progress: InstallProgress) => void,
): Promise<TauriVoicePluginStatusDto | null> {
  let unlisten: (() => void) | undefined;
  try {
    if (isTauriShell()) {
      unlisten = await listenVoicePluginInstallProgress((event) => {
        const progress = normalizeProgress(event);
        onProgress?.(progress);
        showInstallProgress(progress);
      });
    }

    for (let attempt = 0; attempt < 900; attempt += 1) {
      const dto = await fetchHostStatus();
      if (!dto) return null;

      if (dto.status !== "downloading") {
        if (isCaptureReadyStatus(dto.status)) return dto;
        if (dto.installed && (await isRuntimeReady())) return dto;
        if (dto.status === "installed" || dto.status === "stopped") return dto;
        if (dto.status === "error") return dto;
        if (dto.status === "not_installed" && !dto.installed) return dto;
      }

      if (process.env.NODE_ENV === "development" && !isTauriShell()) {
        await new Promise((resolve) => window.setTimeout(resolve, 2_000));
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 1_000));
      }
    }

    return fetchHostStatus();
  } finally {
    await unlisten?.();
  }
}

async function installViaTauri(
  onProgress: (progress: InstallProgress) => void,
): Promise<TauriVoicePluginStatusDto> {
  let unlisten: (() => void) | undefined;
  try {
    unlisten = await listenVoicePluginInstallProgress((event: VoiceInstallProgressEvent) => {
      const progress = normalizeProgress(event);
      onProgress(progress);
      showInstallProgress(progress);
    });
    return await tauriVoicePluginInstall();
  } finally {
    await unlisten?.();
  }
}

async function installViaDev(
  onProgress: (progress: InstallProgress) => void,
  options?: { force?: boolean; preferNetwork?: boolean },
): Promise<TauriVoicePluginStatusDto> {
  return devVoicePluginInstall({
    force: options?.force,
    preferNetwork: options?.preferNetwork,
    onProgress: (event) => {
      const progress = normalizeProgress(event);
      onProgress(progress);
      showInstallProgress(progress);
    },
  });
}

async function startRuntimeIfNeeded(
  dto: TauriVoicePluginStatusDto,
  onProgress: (progress: InstallProgress) => void,
): Promise<TauriVoicePluginStatusDto> {
  if (isCaptureReadyStatus(dto.status)) return dto;
  if (await isRuntimeReady()) return dto;

  if (dto.status === "installed" || dto.status === "stopped" || dto.installed) {
    onProgress({ percent: 95, message: "正在启动语音服务…" });
    showInstallProgress({ percent: 95, message: "正在启动语音服务…" });
    if (isTauriShell()) {
      return tauriVoicePluginStartRuntime();
    }
    if (process.env.NODE_ENV === "development") {
      await requestDevVoiceRuntimeStart();
    }
  }

  return dto;
}

async function runVoicePluginInstallFlow(
  options?: VoicePluginInstallFlowOptions,
): Promise<boolean> {
  const force = options?.force === true;
  const skipConfirm = options?.skipConfirm === true;

  if (!force && (await isRuntimeReady())) {
    return true;
  }

  const initial = await fetchHostStatus();
  if (!initial && isTauriShell()) {
    showInstallError("无法读取语音插件状态，请重启 QuickerAgent 后重试。");
    return false;
  }
  if (!force && initial && isCaptureReadyStatus(initial.status)) {
    return true;
  }

  if (initial?.status === "downloading") {
    showInstallProgress({ percent: 0, message: "正在下载语音组件…" });
    const dto = await waitForHostReady((progress) => showInstallProgress(progress));
    if (!dto) {
      hideInstallProgress();
      showInstallError("无法读取安装状态");
      return false;
    }
    if (dto.status === "error") {
      hideInstallProgress();
      showInstallError(dto.message ?? "安装失败");
      return false;
    }
    const started = await startRuntimeIfNeeded(dto, (p) => showInstallProgress(p));
    hideInstallProgress();
    if (isCaptureReadyStatus(started.status) || (await isRuntimeReady())) {
      notifyVoiceConfigChanged();
      showInstallSuccess("语音输入已就绪，请再次点击麦克风开始说话。");
      return true;
    }
    showInstallError(started.message ?? "语音服务未就绪");
    return false;
  }

  const needsInstall =
    force
    || !initial?.installed
    || initial.status === "not_installed";
  if (needsInstall && !skipConfirm) {
    const confirmed = await appConfirm(
      "首次使用需下载本地语音识别组件（约 240 MB，需联网）。安装完成后可离线使用。",
      {
        title: "安装语音输入",
        confirmLabel: "安装",
        cancelLabel: "取消",
        defaultConfirm: true,
      },
    );
    if (!confirmed) return false;
  }

  if (!isTauriShell() && process.env.NODE_ENV !== "development") {
    showInstallError("请在 QuickerAgent 桌面版中使用语音输入。");
    return false;
  }

  showInstallProgress({ percent: 0, message: needsInstall ? "准备安装…" : "正在启动…" });

  try {
    let dto = initial;
    if (needsInstall) {
      dto = isTauriShell()
        ? await installViaTauri((progress) => showInstallProgress(progress))
        : await installViaDev(
            (progress) => showInstallProgress(progress),
            { force, preferNetwork: options?.preferNetwork },
          );
      showInstallProgress({ percent: 100, message: dto.message ?? "安装完成" });
    }

    if (!dto) {
      throw new Error("无法读取安装状态");
    }

    dto = await startRuntimeIfNeeded(dto, (progress) => showInstallProgress(progress));

    if (!isCaptureReadyStatus(dto.status) && !(await isRuntimeReady())) {
      const waited = await waitForHostReady((progress) => showInstallProgress(progress));
      if (waited) dto = waited;
    }

    hideInstallProgress();

    if (isCaptureReadyStatus(dto.status) || (await isRuntimeReady())) {
      notifyVoiceConfigChanged();
      showInstallSuccess("语音输入已就绪，请再次点击麦克风开始说话。");
      return true;
    }

    showInstallError(dto.message ?? "语音服务未就绪，请稍后再试。");
    return false;
  } catch (err) {
    hideInstallProgress();
    showInstallError(err instanceof Error ? err.message : "安装失败");
    return false;
  }
}

/** Prompt (if needed), install, start runtime; progress + result via bottom-right toasts. */
export function requestVoicePluginSetup(
  options?: VoicePluginInstallFlowOptions,
): Promise<boolean> {
  if (installPromise) return installPromise;
  installPromise = runVoicePluginInstallFlow(options).finally(() => {
    installPromise = null;
  });
  return installPromise;
}
