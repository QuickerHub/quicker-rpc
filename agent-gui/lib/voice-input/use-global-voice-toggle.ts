"use client";

import { useEffect } from "react";
import { isTauriShell } from "@/lib/tauri-shell";
import {
  runVoiceToggleAction,
  type VoiceToggleActionOptions,
} from "@/lib/voice-input/voice-toggle-action";

export const GLOBAL_VOICE_TOGGLE_EVENT = "global:voice-toggle";

type UseGlobalVoiceToggleOptions = VoiceToggleActionOptions & {
  enabled?: boolean;
  /** Called when the global shortcut targets this webview (e.g. launcher opened). */
  onGlobalActivate?: () => void;
};

/** Handle Tauri global Ctrl/Cmd+Shift+V emitted from the Rust shortcut handler. */
export function useGlobalVoiceToggle({
  enabled = true,
  onGlobalActivate,
  ...action
}: UseGlobalVoiceToggleOptions): void {
  useEffect(() => {
    if (!enabled || !isTauriShell()) return;

    let unlisten: (() => void) | undefined;
    let disposed = false;

    void (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      if (disposed) return;

      unlisten = await listen(GLOBAL_VOICE_TOGGLE_EVENT, () => {
        onGlobalActivate?.();
        runVoiceToggleAction(action);
      });
    })();

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [
    enabled,
    onGlobalActivate,
    action.phase,
    action.canUse,
    action.pluginStatus,
    action.onStart,
    action.onStop,
    action.onUnavailable,
  ]);
}
