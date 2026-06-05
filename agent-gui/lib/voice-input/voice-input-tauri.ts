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

