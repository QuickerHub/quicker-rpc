"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchVoiceRuntimeHealth } from "@/lib/voice-input/voice-input-health";
import {
  isVoiceInputMockEnabled,
  resolveVoicePluginStatusSync,
} from "@/lib/voice-input/voice-input-plugin-status";
import { fetchTauriVoicePluginStatus } from "@/lib/voice-input/voice-input-tauri";
import type { VoicePluginStatus } from "@/lib/voice-input/voice-input-types";

const POLL_MS = 5_000;

function mapHealthToStatus(
  health: Awaited<ReturnType<typeof fetchVoiceRuntimeHealth>>,
): VoicePluginStatus {
  if (!health?.ok) return "not_installed";
  if (health.modelLoaded && health.modelId !== "stub") return "running";
  return "starting";
}

/** Polls mock / HTTP health / Tauri plugin host for composer + settings UI. */
export function useVoicePluginStatus(active = true): VoicePluginStatus {
  const [status, setStatus] = useState<VoicePluginStatus>("not_installed");

  const refresh = useCallback(async () => {
    if (isVoiceInputMockEnabled()) {
      setStatus("running");
      return;
    }

    const tauriDto = await fetchTauriVoicePluginStatus();
    if (tauriDto) {
      setStatus(tauriDto.status);
      return;
    }

    const health = await fetchVoiceRuntimeHealth();
    setStatus(mapHealthToStatus(health));
  }, []);

  useEffect(() => {
    if (!active) return;

    void refresh();
    const onChange = () => void refresh();
    window.addEventListener("voice-input-mock-changed", onChange);
    window.addEventListener("voice-input-config-changed", onChange);
    window.addEventListener("storage", onChange);

    const timer = window.setInterval(() => void refresh(), POLL_MS);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("voice-input-mock-changed", onChange);
      window.removeEventListener("voice-input-config-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [active, refresh]);

  return status;
}

export function useVoicePluginStatusOnce(): VoicePluginStatus {
  return useVoicePluginStatus(true);
}

/** SSR / non-hook fallback. */
export { resolveVoicePluginStatusSync as resolveVoicePluginStatus };
