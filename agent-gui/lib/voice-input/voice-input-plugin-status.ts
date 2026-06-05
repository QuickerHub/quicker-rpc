import type { VoicePluginStatus } from "@/lib/voice-input/voice-input-types";
import { VOICE_INPUT_MOCK_STORAGE_KEY } from "@/lib/voice-input/voice-input-types";

/** Dev-only: fake ASR samples for UI testing. Default off — use real mic + Runtime. */
export function isVoiceInputMockEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NODE_ENV !== "development") return false;
  return localStorage.getItem(VOICE_INPUT_MOCK_STORAGE_KEY) === "1";
}

export function setVoiceInputMockEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(VOICE_INPUT_MOCK_STORAGE_KEY, enabled ? "1" : "0");
  window.dispatchEvent(new Event("voice-input-mock-changed"));
}

/** Sync fallback when hooks are unavailable. */
export function resolveVoicePluginStatusSync(): VoicePluginStatus {
  if (typeof window === "undefined") return "not_installed";
  if (isVoiceInputMockEnabled()) return "running";
  return "not_installed";
}

export function voicePluginStatusLabel(status: VoicePluginStatus): string {
  switch (status) {
    case "not_installed":
      return "未安装";
    case "downloading":
      return "下载中";
    case "installed":
      return "已安装，未启动";
    case "starting":
      return "启动中";
    case "running":
      return "运行中";
    case "stopped":
      return "已停止";
    case "error":
      return "错误";
    default:
      return status;
  }
}

export function canUseVoiceInput(status: VoicePluginStatus): boolean {
  return status === "running" || status === "starting";
}
