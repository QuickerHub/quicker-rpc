"use client";

import { useEffect } from "react";
import { listenDesktop } from "@/lib/desktop-bridge";
import { isDesktopShell } from "@/lib/desktop-shell";
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

/** Handle desktop global voice toggle events (Tauri / Electron launcher shortcut). */
export function useGlobalVoiceToggle({
  enabled = true,
  onGlobalActivate,
  ...action
}: UseGlobalVoiceToggleOptions): void {
  useEffect(() => {
    if (!enabled || !isDesktopShell()) return;

    let unlisten: (() => void) | undefined;
    let disposed = false;

    void (async () => {
      if (disposed) return;
      unlisten = await listenDesktop(GLOBAL_VOICE_TOGGLE_EVENT, () => {
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
    action.onStarting,
    action.onUnavailable,
  ]);
}
