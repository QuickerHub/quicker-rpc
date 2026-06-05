"use client";

import { useCallback, useEffect, useState } from "react";
import { getVoiceWsPort, setVoiceWsPort } from "@/lib/voice-input/voice-input-config";
import { fetchVoiceRuntimeHealth } from "@/lib/voice-input/voice-input-health";
import {
  isVoiceInputMockEnabled,
  resolveVoicePluginStatusSync,
} from "@/lib/voice-input/voice-input-plugin-status";
import { fetchDevVoicePluginHostStatus } from "@/lib/voice-input/voice-input-dev-install";
import { fetchTauriVoicePluginStatus } from "@/lib/voice-input/voice-input-tauri";
import type { VoicePluginStatus } from "@/lib/voice-input/voice-input-types";

const POLL_MS = 5_000;

function mapHealthToStatus(
  health: Awaited<ReturnType<typeof fetchVoiceRuntimeHealth>>,
): VoicePluginStatus {
  if (!health?.ok) return "not_installed";
  if (health.ready) return "running";
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

    try {
      const port = getVoiceWsPort();
      const [tauriResult, devResult, healthResult] = await Promise.allSettled([
        fetchTauriVoicePluginStatus(),
        process.env.NODE_ENV === "development"
          ? fetchDevVoicePluginHostStatus()
          : Promise.resolve(null),
        fetchVoiceRuntimeHealth(port),
      ]);

      const tauriDto =
        tauriResult.status === "fulfilled" ? tauriResult.value : null;
      const devDto =
        devResult.status === "fulfilled" ? devResult.value : null;
      const health =
        healthResult.status === "fulfilled" ? healthResult.value : null;
      const hostDto = tauriDto ?? devDto;

      if (hostDto) {
        if (hostDto.wsPort > 0) {
          setVoiceWsPort(hostDto.wsPort);
        }
        if (hostDto.status === "downloading") {
          setStatus("downloading");
          return;
        }
        if (hostDto.installed) {
          if (health?.ready) {
            setStatus("running");
            return;
          }
          if (health?.ok) {
            setStatus("starting");
            return;
          }
          setStatus(hostDto.status === "error" ? "error" : "installed");
          return;
        }
      }

      // External/dev runtime on :6016 — usable even when plugin zip is not installed.
      if (health?.ready) {
        setStatus("running");
        return;
      }
      if (health?.ok) {
        setStatus("starting");
        return;
      }

      if (tauriDto) {
        setStatus(tauriDto.status);
        return;
      }

      if (devDto) {
        setStatus(devDto.status);
        return;
      }

      setStatus(mapHealthToStatus(health));
    } catch {
      setStatus("error");
    }
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
