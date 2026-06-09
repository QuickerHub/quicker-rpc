"use client";

import { useEffect, useRef } from "react";
import { isTauriShell } from "@/lib/tauri-shell";
import { requestDevVoiceRuntimeStart } from "@/lib/voice-input/voice-input-dev-runtime";
import { isVoiceInputMockEnabled } from "@/lib/voice-input/voice-input-plugin-status";
import {
  PLUGIN_ACTIVATION_VOICE_INPUT,
  pluginActivate,
} from "@/lib/plugin-runtime-client";
import {
  fetchTauriVoicePluginStatus,
  tauriVoicePluginStartRuntime,
} from "@/lib/voice-input/voice-input-tauri";
import { requestVoicePluginSetup } from "@/lib/voice-input/voice-plugin-install-flow";
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
    if (status !== "installed" && status !== "not_installed") return;
    if (requestedRef.current) return;
    requestedRef.current = true;

    void (async () => {
      window.dispatchEvent(new Event("voice-input-config-changed"));

      if (isTauriShell()) {
        const dto = await fetchTauriVoicePluginStatus();
        if (dto?.status === "running" || dto?.status === "starting") return;
        if (!dto?.installed) {
          try {
            await pluginActivate("voice-asr", PLUGIN_ACTIVATION_VOICE_INPUT);
          } catch {
            void requestVoicePluginSetup({ skipConfirm: true }).catch(() => undefined);
          }
          return;
        }
        try {
          await pluginActivate("voice-asr", PLUGIN_ACTIVATION_VOICE_INPUT);
        } catch {
          void tauriVoicePluginStartRuntime().catch(() => undefined);
        }
        return;
      }

      if (process.env.NODE_ENV === "development") {
        if (status === "not_installed") {
          void requestVoicePluginSetup({ skipConfirm: true }).catch(() => undefined);
          return;
        }
        void requestDevVoiceRuntimeStart();
      }
    })();
  }, [status]);
}
