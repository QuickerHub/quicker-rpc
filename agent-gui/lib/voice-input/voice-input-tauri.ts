"use client";

import { invokeDesktop, listenDesktop } from "@/lib/desktop-bridge";
import { isDesktopShell } from "@/lib/desktop-shell";
import type { VoiceModelDownloadProgress } from "@/lib/voice-input/voice-input-settings";
import type { VoicePluginStatus } from "@/lib/voice-input/voice-input-types";
import {
  fetchVoiceRuntimeHealth,
  isVoiceRuntimeModelReady,
} from "@/lib/voice-input/voice-input-health";
import { withPromiseTimeout } from "@/lib/promise-timeout";

const DESKTOP_INVOKE_TIMEOUT_MS = 12_000;

export type TauriVoicePluginStatusDto = {
  status: VoicePluginStatus;
  installed: boolean;
  running: boolean;
  wsPort: number;
  pluginDir: string | null;
  message: string | null;
};

export type VoiceInstallProgressEvent = {
  phase: string;
  percent: number;
  message: string;
};

async function invokeVoicePluginStatus(): Promise<TauriVoicePluginStatusDto> {
  return withPromiseTimeout(
    invokeDesktop<TauriVoicePluginStatusDto>("voice_plugin_status"),
    DESKTOP_INVOKE_TIMEOUT_MS,
    "语音插件状态检测超时",
  );
}

export async function fetchTauriVoicePluginStatus(): Promise<TauriVoicePluginStatusDto | null> {
  if (!isDesktopShell()) return null;
  try {
    return await invokeVoicePluginStatus();
  } catch {
    return null;
  }
}

export async function tauriVoicePluginStartRuntime(): Promise<TauriVoicePluginStatusDto> {
  return withPromiseTimeout(
    invokeDesktop<TauriVoicePluginStatusDto>("voice_plugin_start_runtime"),
    DESKTOP_INVOKE_TIMEOUT_MS,
    "启动语音服务超时",
  );
}

export async function tauriVoicePluginRedownloadModel(
  modelId: "standard" | "lightweight",
  onProgress?: (progress: VoiceModelDownloadProgress) => void,
  force = false,
): Promise<void> {
  let unlisten: (() => void) | undefined;
  try {
    unlisten = await listenVoicePluginInstallProgress((event) => {
      onProgress?.({
        phase: event.phase,
        percent: event.percent,
        message: event.message || `${event.phase} ${event.percent}%`,
      });
    });
    await withPromiseTimeout(
      invokeDesktop<void>("voice_plugin_redownload_model", { modelId, force }),
      30 * 60_000,
      "模型重新下载超时",
    );
  } finally {
    await unlisten?.();
  }
}

export async function tauriVoicePluginStopRuntime(): Promise<TauriVoicePluginStatusDto> {
  return withPromiseTimeout(
    invokeDesktop<TauriVoicePluginStatusDto>("voice_plugin_stop_runtime"),
    DESKTOP_INVOKE_TIMEOUT_MS,
    "停止语音服务超时",
  );
}

export async function listenVoicePluginInstallProgress(
  onProgress: (event: VoiceInstallProgressEvent) => void,
): Promise<() => void> {
  return listenDesktop("voice-plugin-install-progress", (payload) => {
    if (!payload || typeof payload !== "object") return;
    const event = payload as VoiceInstallProgressEvent;
    onProgress(event);
  });
}

export async function tauriVoicePluginInstall(): Promise<TauriVoicePluginStatusDto> {
  return withPromiseTimeout(
    invokeDesktop<TauriVoicePluginStatusDto>("voice_plugin_install"),
    10 * 60_000,
    "语音插件安装超时",
  );
}

const VOICE_READY_STATUSES = new Set<VoicePluginStatus>([
  "running",
  "starting",
]);

function isVoiceCaptureReady(status: VoicePluginStatus): boolean {
  return VOICE_READY_STATUSES.has(status);
}

async function verifyRuntimeModelReady(
  dto: TauriVoicePluginStatusDto,
  onProgress?: (message: string) => void,
): Promise<boolean> {
  if (dto.wsPort <= 0) return false;
  onProgress?.("正在加载语音识别模型…");
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const health = await fetchVoiceRuntimeHealth(dto.wsPort);
    if (isVoiceRuntimeModelReady(health)) return true;
    if (dto.status === "running" && attempt >= 8) break;
    await new Promise((resolve) => window.setTimeout(resolve, 500));
  }
  return false;
}

async function finalizeVoiceReady(
  dto: TauriVoicePluginStatusDto | null | undefined,
  onProgress?: (message: string) => void,
): Promise<boolean> {
  if (!dto || !isVoiceCaptureReady(dto.status)) return false;
  return verifyRuntimeModelReady(dto, onProgress);
}

/** Install/start voice plugin when needed (desktop shell). Returns true when capture can begin. */
export async function ensureVoicePluginReady(
  onProgress?: (message: string) => void,
): Promise<boolean> {
  if (!isDesktopShell()) return false;

  onProgress?.("正在检查语音服务…");
  let dto = await fetchTauriVoicePluginStatus();
  if (!dto) return false;

  if (isVoiceCaptureReady(dto.status)) {
    return finalizeVoiceReady(dto, onProgress);
  }

  if (dto.status === "downloading") {
    onProgress?.("正在下载语音插件…");
    dto = await waitForVoicePluginInstall(onProgress);
    if (!dto || !isVoiceCaptureReady(dto.status)) {
      if (dto?.status === "installed" || dto?.status === "stopped") {
        dto = await tauriVoicePluginStartRuntime();
      }
    }
    return finalizeVoiceReady(dto, onProgress);
  }

  if (dto.status === "not_installed" || !dto.installed) {
    onProgress?.("正在安装语音插件…");
    let unlisten: (() => void) | undefined;
    try {
      unlisten = await listenVoicePluginInstallProgress((event) => {
        onProgress?.(event.message || `${event.phase} ${event.percent}%`);
      });
      dto = await tauriVoicePluginInstall();
      if (dto.status === "downloading") {
        dto = (await waitForVoicePluginInstall(onProgress)) ?? dto;
      }
    } finally {
      await unlisten?.();
    }
    if (dto.status === "installed" || dto.status === "stopped") {
      dto = await tauriVoicePluginStartRuntime();
    }
    return finalizeVoiceReady(dto, onProgress);
  }

  if (dto.status === "installed" || dto.status === "stopped") {
    onProgress?.("正在启动语音服务…");
    dto = await tauriVoicePluginStartRuntime();
    return finalizeVoiceReady(dto, onProgress);
  }

  return false;
}

async function waitForVoicePluginInstall(
  onProgress?: (message: string) => void,
): Promise<TauriVoicePluginStatusDto | null> {
  let unlisten: (() => void) | undefined;
  try {
    unlisten = await listenVoicePluginInstallProgress((event) => {
      onProgress?.(event.message || `${event.phase} ${event.percent}%`);
    });

    for (let attempt = 0; attempt < 600; attempt += 1) {
      const dto = await fetchTauriVoicePluginStatus();
      if (!dto) return null;
      if (dto.status !== "downloading") {
        return dto;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
    }
    return fetchTauriVoicePluginStatus();
  } finally {
    await unlisten?.();
  }
}

export type VoiceIpcFinalDto = {
  text: string;
  confidence?: number | null;
};

export async function tauriVoiceIpcSessionStart(params: {
  sessionId: string;
  language?: string;
  streaming?: boolean;
}): Promise<void> {
  return invokeDesktop("voice_ipc_session_start", params);
}

export async function tauriVoiceIpcSessionSendAudio(params: {
  sessionId: string;
  pcm: Uint8Array;
}): Promise<void> {
  return invokeDesktop("voice_ipc_session_send_audio", params);
}

export async function tauriVoiceIpcSessionEnd(params: {
  sessionId: string;
}): Promise<VoiceIpcFinalDto> {
  return invokeDesktop<VoiceIpcFinalDto>("voice_ipc_session_end", params);
}

export async function tauriVoiceIpcSessionCancel(params: {
  sessionId: string;
  reason?: string;
}): Promise<void> {
  return invokeDesktop("voice_ipc_session_cancel", params);
}
