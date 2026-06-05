import type { VoicePluginStatus, VoiceSessionPhase } from "@/lib/voice-input/voice-input-types";

export type VoiceToggleActionOptions = {
  phase: VoiceSessionPhase;
  canUse: boolean;
  pluginStatus: VoicePluginStatus;
  onStart: () => void;
  onStop: () => void;
  onUnavailable?: () => void;
};

/** Shared toggle logic for keyboard and Tauri global shortcut. */
export function runVoiceToggleAction({
  phase,
  canUse,
  onStart,
  onStop,
  onUnavailable,
}: VoiceToggleActionOptions): void {
  if (phase === "recording") {
    onStop();
    return;
  }
  if (phase === "transcribing") return;

  if (canUse) {
    onStart();
    return;
  }

  onUnavailable?.();
}
