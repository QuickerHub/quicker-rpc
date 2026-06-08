"use client";

import { useEffect, useRef } from "react";
import { isTauriShell } from "@/lib/tauri-shell";
import { requestDevVoiceRuntimeStart } from "@/lib/voice-input/voice-input-dev-runtime";
import { isVoiceInputMockEnabled } from "@/lib/voice-input/voice-input-plugin-status";
import {
  fetchTauriVoicePluginStatus,
  tauriVoicePluginStartRuntime,
} from "@/lib/voice-input/voice-input-tauri";
import { useVoicePluginStatus } from "@/lib/voice-input/use-voice-plugin-status";

/**
 * After UI mount, kick off voice runtime in the background when the plugin is
 * installed but not running (does not block first paint).
 */
export function useVoiceRuntimeBootstrap(): void {
  const status = useVoicePluginStatus(true);
  const requestedRef = useRef(false);

  useEffect(() => {
    if (isVoiceInputMockEnabled()) return;
    if (status !== "installed") return;
    if (requestedRef.current) return;
    requestedRef.current = true;

    void (async () => {
      window.dispatchEvent(new Event("voice-input-config-changed"));

      if (isTauriShell()) {
        const dto = await fetchTauriVoicePluginStatus();
        if (!dto?.installed) return;
        if (dto.status === "running" || dto.status === "starting") return;
        void tauriVoicePluginStartRuntime().catch(() => undefined);
        return;
      }

      if (process.env.NODE_ENV === "development") {
        void requestDevVoiceRuntimeStart();
      }
    })();
  }, [status]);
}
