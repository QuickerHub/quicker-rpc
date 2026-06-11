"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getVoiceWsPort, setVoiceWsPort } from "@/lib/voice-input/voice-input-config";
import { fetchVoiceRuntimeHealth, isVoiceRuntimeModelReady } from "@/lib/voice-input/voice-input-health";
import {
  isVoiceInputMockEnabled,
  resolveVoicePluginStatusSync,
} from "@/lib/voice-input/voice-input-plugin-status";
import { fetchTauriVoicePluginStatus } from "@/lib/voice-input/voice-input-tauri";
import { isDesktopShell } from "@/lib/desktop-shell";
import type { VoicePluginStatus } from "@/lib/voice-input/voice-input-types";

const POLL_MS_STARTING = 5_000;
const POLL_MS_PROBE = 30_000;

/** Background poll only while state may change; stable installed/running use events. */
function shouldBackgroundPoll(status: VoicePluginStatus): boolean {
  return (
    status === "not_installed"
    || status === "downloading"
    || status === "starting"
    || status === "error"
    || status === "stopped"
  );
}

function mapHealthToStatus(
  health: Awaited<ReturnType<typeof fetchVoiceRuntimeHealth>>,
  assumeInstalledInDev: boolean,
): VoicePluginStatus {
  if (isVoiceRuntimeModelReady(health)) return "running";
  if (health?.ok) return "starting";
  return assumeInstalledInDev ? "installed" : "not_installed";
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
      const inTauri = isDesktopShell();
      const assumeInstalledInDev =
        process.env.NODE_ENV === "development" && !inTauri;

      if (inTauri) {
        const [tauriResult, healthResult] = await Promise.allSettled([
          fetchTauriVoicePluginStatus(),
          fetchVoiceRuntimeHealth(port),
        ]);
        const tauriDto =
          tauriResult.status === "fulfilled" ? tauriResult.value : null;
        const health =
          healthResult.status === "fulfilled" ? healthResult.value : null;

        if (tauriDto) {
          if (tauriDto.wsPort > 0) {
            setVoiceWsPort(tauriDto.wsPort);
          }
          if (tauriDto.status === "downloading") {
            setStatus("downloading");
            return;
          }
          if (
            tauriDto.installed
            && tauriDto.status === "running"
            && isVoiceRuntimeModelReady(health)
          ) {
            setStatus("running");
            return;
          }
          if (tauriDto.installed) {
            if (isVoiceRuntimeModelReady(health)) {
              setStatus("running");
              return;
            }
            if (health?.ok) {
              setStatus("starting");
              return;
            }
            setStatus(tauriDto.status === "error" ? "error" : "installed");
            return;
          }
          setStatus(tauriDto.status === "error" ? "error" : "not_installed");
          return;
        }

        setStatus(mapHealthToStatus(health, false));
        return;
      }

      // Browser dev: plugin bundle is expected on disk; probe runtime health only.
      const health = await fetchVoiceRuntimeHealth(port);
      setStatus(mapHealthToStatus(health, assumeInstalledInDev));
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

    return () => {
      window.removeEventListener("voice-input-mock-changed", onChange);
      window.removeEventListener("voice-input-config-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [active, refresh]);

  useEffect(() => {
    if (!active || !shouldBackgroundPoll(status)) return;

    const pollMs = status === "starting" ? POLL_MS_STARTING : POLL_MS_PROBE;
    const timer = window.setInterval(() => void refresh(), pollMs);
    return () => window.clearInterval(timer);
  }, [active, refresh, status]);

  return status;
}

export function useVoicePluginStatusOnce(): VoicePluginStatus {
  return useVoicePluginStatus(true);
}

/** SSR / non-hook fallback. */
export { resolveVoicePluginStatusSync as resolveVoicePluginStatus };
