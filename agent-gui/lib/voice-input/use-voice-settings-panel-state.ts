"use client";

import { useCallback, useEffect, useState } from "react";
import { useReleasePreviewActive } from "@/lib/release-preview.client";
import { isTauriShell } from "@/lib/tauri-shell";
import { getVoiceWsPort } from "@/lib/voice-input/voice-input-config";
import { fetchVoiceRuntimeHealth } from "@/lib/voice-input/voice-input-health";
import { isVoiceInputMockEnabled } from "@/lib/voice-input/voice-input-plugin-status";
import { fetchDevVoicePluginHostStatus } from "@/lib/voice-input/voice-input-dev-install";
import {
  fetchTauriVoicePluginStatus,
  type TauriVoicePluginStatusDto,
} from "@/lib/voice-input/voice-input-tauri";
import type { VoicePluginStatus } from "@/lib/voice-input/voice-input-types";

const POLL_MS = 5_000;

export type VoiceSettingsPanelSnapshot = {
  hostStatus: TauriVoicePluginStatusDto | null;
  pluginInstalled: boolean;
  hostLoading: boolean;
  runtimeOnline: boolean;
  runtimePhase: VoicePluginStatus;
  runtimeDetail: string | null;
  displayLabel: string;
  displaySubline: string | null;
};

function buildRuntimeDetail(
  health: Awaited<ReturnType<typeof fetchVoiceRuntimeHealth>>,
  port: number,
): string | null {
  if (!health) return `Runtime 未连接 :${port}`;
  if (health.ready) {
    const parts = [
      health.runtimeVersion,
      health.modelId && health.modelId !== "stub" ? health.modelId : null,
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
  if (pluginInstalled) {
    if (runtimePhase === "running") return "运行中";
    if (runtimePhase === "starting") return "启动中";
    return "已安装";
  }
  if (runtimePhase === "running") return "运行中（未安装）";
  if (runtimePhase === "starting") return "启动中（未安装）";
  return "未安装";
}

function buildSnapshot(params: {
  hostStatus: TauriVoicePluginStatusDto | null;
  hostLoading: boolean;
  runtimePhase: VoicePluginStatus;
  runtimeDetail: string | null;
}): VoiceSettingsPanelSnapshot {
  const pluginInstalled = params.hostStatus?.installed === true;
  const runtimeOnline =
    params.runtimePhase === "running" || params.runtimePhase === "starting";

  return {
    hostStatus: params.hostStatus,
    pluginInstalled,
    hostLoading: params.hostLoading,
    runtimeOnline,
    runtimePhase: params.runtimePhase,
    runtimeDetail: params.runtimeDetail,
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
  const inTauri = isTauriShell();
  const releasePreview = useReleasePreviewActive();
  const useDevVoiceHost = process.env.NODE_ENV === "development" && !releasePreview;

  const [snapshot, setSnapshot] = useState<VoiceSettingsPanelSnapshot>(() =>
    buildSnapshot({
      hostStatus: null,
      hostLoading: true,
      runtimePhase: "not_installed",
      runtimeDetail: null,
    }),
  );

  const refresh = useCallback(async () => {
    if (isVoiceInputMockEnabled()) {
      setSnapshot(
        buildSnapshot({
          hostStatus: null,
          hostLoading: false,
          runtimePhase: "running",
          runtimeDetail: "mock 模式",
        }),
      );
      return;
    }

    const port = getVoiceWsPort();
    const [hostStatus, health] = await Promise.all([
      inTauri
        ? fetchTauriVoicePluginStatus()
        : useDevVoiceHost
          ? fetchDevVoicePluginHostStatus()
          : Promise.resolve(null),
      fetchVoiceRuntimeHealth(port),
    ]);

    if (hostStatus?.status === "downloading") {
      setSnapshot(
        buildSnapshot({
          hostStatus,
          hostLoading: false,
          runtimePhase: "downloading",
          runtimeDetail: hostStatus.message,
        }),
      );
      return;
    }

    let runtimePhase: VoicePluginStatus;
    if (health?.ready) {
      runtimePhase = "running";
    } else if (health?.ok) {
      runtimePhase = "starting";
    } else if (hostStatus?.installed) {
      runtimePhase = "installed";
    } else if (hostStatus?.status === "error") {
      runtimePhase = "error";
    } else {
      runtimePhase = "not_installed";
    }

    setSnapshot(
      buildSnapshot({
        hostStatus,
        hostLoading: false,
        runtimePhase,
        runtimeDetail: buildRuntimeDetail(health, port),
      }),
    );
  }, [inTauri, useDevVoiceHost]);

  useEffect(() => {
    if (!active) return;

    void refresh();
    const onChange = () => void refresh();
    window.addEventListener("voice-input-mock-changed", onChange);
    window.addEventListener("voice-input-config-changed", onChange);

    const timer = window.setInterval(() => void refresh(), POLL_MS);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("voice-input-mock-changed", onChange);
      window.removeEventListener("voice-input-config-changed", onChange);
    };
  }, [active, refresh]);

  return snapshot;
}
