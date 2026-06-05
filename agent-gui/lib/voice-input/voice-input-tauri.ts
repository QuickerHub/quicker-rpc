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

