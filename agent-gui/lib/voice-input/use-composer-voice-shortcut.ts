"use client";

import { useEffect } from "react";
import { isTauriShell } from "@/lib/tauri-shell";
import { isVoiceInputToggleShortcut } from "@/lib/voice-input/voice-input-shortcuts";
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
  onUnavailable?: () => void;
};

/** Toggle voice input via Ctrl/Cmd+Shift+V while the page has focus (browser only). */
export function useComposerVoiceToggleShortcut({
  enabled = true,
  phase,
  canUse,
  pluginStatus,
  onStart,
  onStop,
  onUnavailable,
}: UseComposerVoiceToggleShortcutOptions): void {
  useEffect(() => {
    if (!enabled || isTauriShell()) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isVoiceInputToggleShortcut(event)) return;
      if (document.visibilityState === "hidden") return;

      event.preventDefault();
      event.stopPropagation();

      runVoiceToggleAction({
        phase,
        canUse,
        pluginStatus,
        onStart,
        onStop,
        onUnavailable,
      });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    enabled,
    phase,
    canUse,
    pluginStatus,
    onStart,
    onStop,
    onUnavailable,
  ]);
}
