"use client";

import { useEffect } from "react";
import { subscribeComposerVoiceShortcut } from "@/lib/voice-input/composer-voice-shortcut";
import { notifyVoiceServiceStarting } from "@/lib/voice-input/voice-input-notify";
import { runVoiceToggleAction } from "@/lib/voice-input/voice-toggle-action";
import type {
  VoicePluginStatus,
  VoiceSessionPhase,
} from "@/lib/voice-input/voice-input-types";

type UseComposerVoiceToggleShortcutOptions = {
  enabled?: boolean;
  phase: VoiceSessionPhase;
  canUse: boolean;
  pluginStatus: VoicePluginStatus;
  onStart: () => void;
  onStop: () => void;
  onStarting?: () => void;
  onUnavailable?: () => void;
};

/** Toggle voice input via Ctrl/Cmd+Shift+V while the page has focus. */
export function useComposerVoiceToggleShortcut({
  enabled = true,
  phase,
  canUse,
  pluginStatus,
  onStart,
  onStop,
  onStarting = notifyVoiceServiceStarting,
  onUnavailable,
}: UseComposerVoiceToggleShortcutOptions): void {
  useEffect(() => {
    return subscribeComposerVoiceShortcut(window, {
      enabled,
      isDocumentHidden: () => document.visibilityState === "hidden",
      onToggle: () => runVoiceToggleAction({
        phase,
        canUse,
        pluginStatus,
        onStart,
        onStop,
        onStarting,
        onUnavailable,
      }),
    });
  }, [
    enabled,
    phase,
    canUse,
    pluginStatus,
    onStart,
    onStop,
    onStarting,
    onUnavailable,
  ]);
}
