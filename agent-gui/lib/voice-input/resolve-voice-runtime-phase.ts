import type { VoicePluginStatus } from "@/lib/voice-input/voice-input-types";
import type { TauriVoicePluginStatusDto } from "@/lib/voice-input/voice-input-tauri";
import type { VoiceRuntimeHealth } from "@/lib/voice-input/voice-input-health";
import { isVoiceRuntimeModelReady } from "@/lib/voice-input/voice-input-health";

/** Derive UI runtime phase; never report running unless the host says the plugin is installed. */
export function resolveVoiceRuntimePhase(params: {
  hostStatus: TauriVoicePluginStatusDto | null;
  health: VoiceRuntimeHealth | null;
  inTauri: boolean;
  allowExternalDevRuntime?: boolean;
}): VoicePluginStatus {
  const { hostStatus, health, inTauri, allowExternalDevRuntime = false } = params;
  const pluginInstalled = hostStatus?.installed === true;

  if (hostStatus?.status === "downloading") {
    return "downloading";
  }

  if (hostStatus?.status === "running" && pluginInstalled && isVoiceRuntimeModelReady(health)) {
    return "running";
  }

  if (isVoiceRuntimeModelReady(health) && pluginInstalled) {
    return "running";
  }

  if (health?.ok && pluginInstalled) {
    return "starting";
  }

  if (pluginInstalled) {
    return hostStatus?.status === "error" ? "error" : "installed";
  }

  if (allowExternalDevRuntime && isVoiceRuntimeModelReady(health)) {
    return "running";
  }

  if (allowExternalDevRuntime && health?.ok) {
    return "starting";
  }

  if (hostStatus?.status === "error") {
    return "error";
  }

  if (inTauri && !hostStatus) {
    if (isVoiceRuntimeModelReady(health)) {
      return "running";
    }
    if (health?.ok) {
      return "starting";
    }
    return "error";
  }

  return hostStatus?.status ?? "not_installed";
}
