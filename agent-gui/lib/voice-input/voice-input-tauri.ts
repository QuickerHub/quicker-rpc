import type { VoicePluginStatus } from "@/lib/voice-input/voice-input-types";
import { isTauriShell } from "@/lib/tauri-shell";

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

export async function fetchTauriVoicePluginStatus(): Promise<TauriVoicePluginStatusDto | null> {
  if (!isTauriShell()) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<TauriVoicePluginStatusDto>("voice_plugin_status");
  } catch {
    return null;
  }
}

export async function tauriVoicePluginStartRuntime(): Promise<TauriVoicePluginStatusDto> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<TauriVoicePluginStatusDto>("voice_plugin_start_runtime");
}

export async function tauriVoicePluginStopRuntime(): Promise<TauriVoicePluginStatusDto> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<TauriVoicePluginStatusDto>("voice_plugin_stop_runtime");
}

export async function listenVoicePluginInstallProgress(
  onProgress: (event: VoiceInstallProgressEvent) => void,
): Promise<() => void> {
  const { listen } = await import("@tauri-apps/api/event");
  const unlisten = await listen<VoiceInstallProgressEvent>(
    "voice-plugin-install-progress",
    (event) => onProgress(event.payload),
  );
  return unlisten;
}

export async function tauriVoicePluginInstall(): Promise<TauriVoicePluginStatusDto> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<TauriVoicePluginStatusDto>("voice_plugin_install");
}

const VOICE_READY_STATUSES = new Set<VoicePluginStatus>([
  "running",
  "starting",
]);

function isVoiceCaptureReady(status: VoicePluginStatus): boolean {
  return VOICE_READY_STATUSES.has(status);
}

/** Install/start voice plugin when needed (Tauri release). Returns true when capture can begin. */
export async function ensureVoicePluginReady(
  onProgress?: (message: string) => void,
): Promise<boolean> {
  if (!isTauriShell()) return false;

  onProgress?.("正在检查语音服务…");
  let dto = await fetchTauriVoicePluginStatus();
  if (!dto) return false;

  if (isVoiceCaptureReady(dto.status)) {
    return true;
  }

  if (dto.status === "downloading") {
    onProgress?.("正在下载语音插件…");
    dto = await waitForVoicePluginInstall(onProgress);
    if (!dto || !isVoiceCaptureReady(dto.status)) {
      if (dto?.status === "installed" || dto?.status === "stopped") {
        dto = await tauriVoicePluginStartRuntime();
      }
    }
    return dto ? isVoiceCaptureReady(dto.status) : false;
  }

  if (dto.status === "not_installed" || !dto.installed) {
    onProgress?.("正在安装语音插件…");
    let unlisten: (() => void) | undefined;
    try {
      unlisten = await listenVoicePluginInstallProgress((event) => {
        onProgress?.(event.message || `${event.phase} ${event.percent}%`);
      });
      dto = await tauriVoicePluginInstall();
    } finally {
      await unlisten?.();
    }
    return dto ? isVoiceCaptureReady(dto.status) : false;
  }

  if (dto.status === "installed" || dto.status === "stopped") {
    onProgress?.("正在启动语音服务…");
    dto = await tauriVoicePluginStartRuntime();
    return isVoiceCaptureReady(dto.status);
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
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke("voice_ipc_session_start", params);
}

export async function tauriVoiceIpcSessionSendAudio(params: {
  sessionId: string;
  pcm: Uint8Array;
}): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke("voice_ipc_session_send_audio", params);
}

export async function tauriVoiceIpcSessionEnd(params: {
  sessionId: string;
}): Promise<VoiceIpcFinalDto> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<VoiceIpcFinalDto>("voice_ipc_session_end", params);
}

export async function tauriVoiceIpcSessionCancel(params: {
  sessionId: string;
  reason?: string;
}): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke("voice_ipc_session_cancel", params);
}

