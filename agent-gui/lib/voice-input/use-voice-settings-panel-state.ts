"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useReleasePreviewActive } from "@/lib/release-preview.client";
import { isDesktopShell } from "@/lib/desktop-shell";
import { getVoiceWsPort } from "@/lib/voice-input/voice-input-config";
import { fetchVoiceRuntimeHealth } from "@/lib/voice-input/voice-input-health";
import { isVoiceInputMockEnabled } from "@/lib/voice-input/voice-input-plugin-status";
import { fetchDevVoicePluginHostStatus } from "@/lib/voice-input/voice-input-dev-install";
import {
  fetchTauriVoicePluginStatus,
  type TauriVoicePluginStatusDto,
} from "@/lib/voice-input/voice-input-tauri";
import { resolveVoiceRuntimePhase } from "@/lib/voice-input/resolve-voice-runtime-phase";
import { executionProviderLabel } from "@/lib/voice-input/voice-input-settings";
import type { VoicePluginStatus } from "@/lib/voice-input/voice-input-types";
import { withPromiseTimeout } from "@/lib/promise-timeout";

const POLL_MS = 5_000;
const HOST_PROBE_TIMEOUT_MS = 15_000;

function shouldSettingsBackgroundPoll(
  runtimePhase: VoicePluginStatus,
  pluginInstalled: boolean,
): boolean {
  if (pluginInstalled && (runtimePhase === "running" || runtimePhase === "installed")) {
    return false;
  }
  return (
    runtimePhase === "not_installed"
    || runtimePhase === "downloading"
    || runtimePhase === "starting"
    || runtimePhase === "error"
    || runtimePhase === "stopped"
  );
}

export type VoiceRuntimeMeta = {
  connected: boolean;
  starting: boolean;
  port: number;
  version?: string;
  modelId?: string;
  executionProvider?: string;
  disconnectedMessage?: string;
};

export type VoiceSettingsPanelSnapshot = {
  hostStatus: TauriVoicePluginStatusDto | null;
  pluginInstalled: boolean;
  hostLoading: boolean;
  runtimeOnline: boolean;
  runtimePhase: VoicePluginStatus;
  runtimeDetail: string | null;
  runtimeMeta: VoiceRuntimeMeta | null;
  activeModelId: string | null;
  displayLabel: string;
  displaySubline: string | null;
};

function buildRuntimeMeta(
  health: Awaited<ReturnType<typeof fetchVoiceRuntimeHealth>>,
  port: number,
): VoiceRuntimeMeta {
  if (!health) {
    return {
      connected: false,
      starting: false,
      port,
      disconnectedMessage: `未连接 :${port}`,
    };
  }
  const modelId =
    health.modelId && health.modelId !== "stub" ? health.modelId : undefined;
  return {
    connected: health.ready === true,
    starting: health.ok === true && health.ready !== true,
    port,
    version: health.runtimeVersion,
    modelId,
    executionProvider: health.executionProvider,
  };
}

function buildRuntimeDetail(
  health: Awaited<ReturnType<typeof fetchVoiceRuntimeHealth>>,
  port: number,
): string | null {
  if (!health) return `Runtime 未连接 :${port}`;
  if (health.ready) {
    const parts = [
      health.runtimeVersion,
      health.modelId && health.modelId !== "stub" ? health.modelId : null,
      health.executionProvider
        ? executionProviderLabel(health.executionProvider)
        : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : "Runtime 已就绪";
  }
  if (health.ok) return "Runtime 启动中…";
  return `Runtime 未连接 :${port}`;
}

function buildDisplayLabel(
  pluginInstalled: boolean,
  runtimePhase: VoicePluginStatus,
  hostLoading: boolean,
): string {
  if (hostLoading) return "检测中…";
  if (runtimePhase === "downloading") return "下载中";
  if (runtimePhase === "running") return "运行中";
  if (runtimePhase === "starting") return "启动中";
  if (pluginInstalled) {
    return "已安装";
  }
  return "未安装";
}

function buildSnapshot(params: {
  hostStatus: TauriVoicePluginStatusDto | null;
  hostLoading: boolean;
  runtimePhase: VoicePluginStatus;
  runtimeDetail: string | null;
  runtimeMeta?: VoiceRuntimeMeta | null;
  activeModelId?: string | null;
}): VoiceSettingsPanelSnapshot {
  const pluginInstalled =
    params.hostStatus?.installed === true
    || params.runtimePhase === "running"
    || params.runtimePhase === "installed"
    || params.runtimePhase === "starting";
  const runtimeOnline =
    params.runtimePhase === "running" || params.runtimePhase === "starting";

  return {
    hostStatus: params.hostStatus,
    pluginInstalled,
    hostLoading: params.hostLoading,
    runtimeOnline,
    runtimePhase: params.runtimePhase,
    runtimeDetail: params.runtimeDetail,
    runtimeMeta: params.runtimeMeta ?? null,
    activeModelId: params.activeModelId ?? null,
    displayLabel: buildDisplayLabel(
      pluginInstalled,
      params.runtimePhase,
      params.hostLoading,
    ),
    displaySubline: params.runtimeDetail,
  };
}

/** Settings panel: one poll merges host install state + runtime /health. */
export function useVoiceSettingsPanelState(active = true): VoiceSettingsPanelSnapshot {
  const inTauri = isDesktopShell();
  const releasePreview = useReleasePreviewActive();
  const useDevVoiceHost =
    process.env.NODE_ENV === "development" && !releasePreview && !inTauri;

  const [snapshot, setSnapshot] = useState<VoiceSettingsPanelSnapshot>(() =>
    buildSnapshot({
      hostStatus: null,
      hostLoading: true,
      runtimePhase: "not_installed",
      runtimeDetail: null,
      runtimeMeta: null,
      activeModelId: null,
    }),
  );
  const devHostProbedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (isVoiceInputMockEnabled()) {
      setSnapshot(
        buildSnapshot({
          hostStatus: null,
          hostLoading: false,
          runtimePhase: "running",
          runtimeDetail: "mock 模式",
          runtimeMeta: null,
          activeModelId: null,
        }),
      );
      return;
    }

    try {
      await withPromiseTimeout(
        (async () => {
          const port = getVoiceWsPort();
          const probeDevHost =
            useDevVoiceHost && active && !devHostProbedRef.current;
          const [hostResult, healthResult] = await Promise.allSettled([
            inTauri
              ? fetchTauriVoicePluginStatus()
              : probeDevHost
                ? fetchDevVoicePluginHostStatus()
                : Promise.resolve(null),
            fetchVoiceRuntimeHealth(port),
          ]);

          const hostStatus =
            hostResult.status === "fulfilled" ? hostResult.value : null;
          if (useDevVoiceHost && probeDevHost) {
            devHostProbedRef.current = true;
          }
          const health =
            healthResult.status === "fulfilled" ? healthResult.value : null;

          if (hostStatus?.status === "downloading") {
            setSnapshot(
              buildSnapshot({
                hostStatus,
                hostLoading: false,
                runtimePhase: "downloading",
                runtimeDetail: hostStatus.message,
                runtimeMeta: null,
                activeModelId: null,
              }),
            );
            return;
          }

          let runtimePhase = resolveVoiceRuntimePhase({
            hostStatus,
            health,
            inTauri,
            allowExternalDevRuntime: useDevVoiceHost,
          });
          if (useDevVoiceHost && !hostStatus && runtimePhase === "not_installed") {
            runtimePhase = "installed";
          }

          const runtimeMeta = buildRuntimeMeta(health, port);
          const runtimeDetail =
            inTauri && !hostStatus && runtimePhase === "error"
              ? "无法读取语音插件状态，请重启 QuickerAgent 或点「安装」重试"
              : buildRuntimeDetail(health, port);

          setSnapshot(
            buildSnapshot({
              hostStatus,
              hostLoading: false,
              runtimePhase,
              runtimeDetail,
              runtimeMeta,
              activeModelId:
                health?.modelId && health.modelId !== "stub"
                  ? health.modelId
                  : null,
            }),
          );
        })(),
        HOST_PROBE_TIMEOUT_MS,
        "voice settings host probe timeout",
      );
    } catch {
      setSnapshot(
        buildSnapshot({
          hostStatus: null,
          hostLoading: false,
          runtimePhase: "error",
          runtimeDetail: "检测失败，请点「重新检测」或重启应用",
          runtimeMeta: null,
          activeModelId: null,
        }),
      );
    }
  }, [active, inTauri, useDevVoiceHost]);

  useEffect(() => {
    if (!active) return;

    void refresh();
    const onChange = () => {
      devHostProbedRef.current = false;
      void refresh();
    };
    window.addEventListener("voice-input-mock-changed", onChange);
    window.addEventListener("voice-input-config-changed", onChange);

    const poll = shouldSettingsBackgroundPoll(
      snapshot.runtimePhase,
      snapshot.pluginInstalled,
    );
    const timer = poll
      ? window.setInterval(() => void refresh(), POLL_MS)
      : null;
    return () => {
      if (timer !== null) window.clearInterval(timer);
      window.removeEventListener("voice-input-mock-changed", onChange);
      window.removeEventListener("voice-input-config-changed", onChange);
    };
  }, [active, refresh, snapshot.pluginInstalled, snapshot.runtimePhase]);

  return snapshot;
}
