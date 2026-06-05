import type { ShellPlatform } from "@/lib/tauri-shell";
import type { VoicePluginStatus, VoiceSessionPhase } from "@/lib/voice-input/voice-input-types";
import { voicePluginStatusLabel } from "@/lib/voice-input/voice-input-plugin-status";

/** Toggle composer voice input (keyboard handler pending). */
export const VOICE_INPUT_TOGGLE_SHORTCUT = {
  key: "v",
  shift: true,
  ctrlKey: true,
  metaKey: true,
} as const;

/** True for Ctrl+Shift+V (Windows/Linux) or Cmd+Shift+V (macOS). */
export function isVoiceInputToggleShortcut(event: KeyboardEvent): boolean {
  if (event.key.toLowerCase() !== VOICE_INPUT_TOGGLE_SHORTCUT.key) return false;
  if (!event.shiftKey) return false;
  if (!(event.ctrlKey || event.metaKey)) return false;
  if (event.altKey) return false;
  return true;
}

export function formatVoiceInputToggleShortcut(
  platform: ShellPlatform = "windows",
): string {
  if (platform === "macos") return "⌘+Shift+V";
  return "Ctrl+Shift+V";
}

export function voiceInputToggleAriaKeyshortcuts(
  platform: ShellPlatform = "windows",
): string {
  if (platform === "macos") return "Meta+Shift+V";
  return "Control+Shift+V";
}

export function appendVoiceInputShortcutHint(
  label: string,
  platform: ShellPlatform,
): string {
  return `${label} (${formatVoiceInputToggleShortcut(platform)})`;
}

export function voiceInputButtonTitle(
  pluginStatus: VoicePluginStatus,
  phase: VoiceSessionPhase,
  canUse: boolean,
  platform: ShellPlatform = "windows",
): string {
  if (phase === "recording") {
    return appendVoiceInputShortcutHint("停止语音输入", platform);
  }
  if (phase === "transcribing") return "识别中…";
  if (canUse) return appendVoiceInputShortcutHint("语音输入", platform);
  if (pluginStatus === "not_installed") {
    return appendVoiceInputShortcutHint("安装语音输入", platform);
  }
  if (pluginStatus === "downloading") {
    return "正在安装语音输入…";
  }
  return `语音不可用：${voicePluginStatusLabel(pluginStatus)}`;
}

export function voiceInputStopRecordingTitle(
  platform: ShellPlatform = "windows",
): string {
  return appendVoiceInputShortcutHint("停止录音", platform);
}
