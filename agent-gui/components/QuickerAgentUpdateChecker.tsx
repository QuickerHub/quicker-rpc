"use client";

import { useEffect, useRef } from "react";
import { pushAppMessage } from "@/lib/app-messages";
import {
  hideAppUpdateOverlaySlice,
  patchAppUpdateOverlay,
  patchVoiceUpdateOverlay,
  showApplyingAppUpdateOverlay,
} from "@/lib/app-update-overlay";
import { tryBeginAppUpdateApply } from "@/lib/app-update-apply-guard";
import {
  exitQuickerAgentForPendingUpdateInstall,
  fetchQuickerAgentUpdateStatus,
  listenQuickerAgentUpdateProgress,
  listenQuickerAgentUpdateStatus,
  type QuickerAgentUpdateProgressEvent,
  type QuickerAgentUpdateStatusDto,
} from "@/lib/quicker-agent-update-tauri";
import { checkQuickerAgentUpdate } from "@/lib/quicker-agent-update";
import {
  listenVoicePluginInstallProgress,
  type VoiceInstallProgressEvent,
} from "@/lib/voice-input/voice-input-tauri";
import { isTauriShell } from "@/lib/tauri-shell";

const APP_UPDATE_MESSAGE_ID = "quicker-agent-update-dev";

function normalizeProgress(event: {
  percent?: number;
  message?: string;
  phase?: string;
}): { percent: number; message: string } {
  const percent = Math.max(0, Math.min(100, Math.round(event.percent ?? 0)));
  const message =
    event.message?.trim()
    || `${event.phase ?? "update"} ${percent}%`;
  return { percent, message };
}

async function openDownloadUrl(url: string): Promise<void> {
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
    return;
  } catch {
    // Fallback when opener plugin is unavailable (e.g. plain browser dev).
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

function notifyDevBrowserUpdate(
  installedVersion: string,
  remoteVersion: string,
  downloadUrl: string,
): void {
  pushAppMessage({
    id: APP_UPDATE_MESSAGE_ID,
    kind: "info",
    title: "QuickerAgent 更新",
    body: `有新版本 ${remoteVersion}（当前 ${installedVersion}）`,
    actions: [
      {
        label: "下载",
        primary: true,
        onClick: () => openDownloadUrl(downloadUrl),
      },
      { label: "稍后" },
    ],
  });
}

function syncAppOverlayFromStatus(status: QuickerAgentUpdateStatusDto): void {
  if (status.remoteVersion) {
    patchAppUpdateOverlay({ remoteVersion: status.remoteVersion });
  }
  if (status.installedVersion) {
    patchAppUpdateOverlay({ installedVersion: status.installedVersion });
  }

  if (status.phase === "ready" && status.pendingApplyOnExit) {
    patchAppUpdateOverlay({
      phase: "ready",
      percent: 100,
      message: status.message ?? "更新已就绪",
      error: null,
    });
    return;
  }

  if (status.phase === "error") {
    patchAppUpdateOverlay({
      phase: "error",
      percent: 0,
      message: status.message ?? "更新失败",
      error: status.message ?? "更新失败",
    });
    return;
  }

  if (status.phase === "downloading") {
    patchAppUpdateOverlay({
      phase: "downloading",
      percent: status.downloadPercent,
      message: status.message ?? "正在下载 QuickerAgent 更新…",
      error: null,
    });
    return;
  }

  if (status.phase === "idle") {
    hideAppUpdateOverlaySlice();
  }
}

function syncAppOverlayFromProgress(event: QuickerAgentUpdateProgressEvent): void {
  if (event.phase === "ready") return;

  const versionMatch = event.message.match(/QuickerAgent\s+([\d.]+)/);
  const progress = normalizeProgress(event);
  patchAppUpdateOverlay({
    phase: event.phase === "checking" ? "checking" : "downloading",
    remoteVersion: versionMatch?.[1] ?? undefined,
    percent: progress.percent,
    message: progress.message,
    error: null,
  });
}

/** Tauri release: Rust background download + apply on exit. Dev/browser: legacy prompt. */
export function QuickerAgentUpdateChecker() {
  const startedRef = useRef(false);
  const voiceRuntimeUpgradeRef = useRef(false);
  const exitApplyTriggeredRef = useRef(false);

  useEffect(() => {
    if (startedRef.current || !isTauriShell()) return;
    startedRef.current = true;

    const controller = new AbortController();
    let unlistenStatus: (() => void) | undefined;
    let unlistenProgress: (() => void) | undefined;
    let unlistenVoice: (() => void) | undefined;
    let unlistenClose: (() => void) | undefined;

    const handleAppStatus = (status: QuickerAgentUpdateStatusDto): void => {
      syncAppOverlayFromStatus(status);
    };

    const handleAppProgress = (event: QuickerAgentUpdateProgressEvent): void => {
      syncAppOverlayFromProgress(event);
    };

    const handleVoiceProgress = (event: VoiceInstallProgressEvent): void => {
      if (event.message.includes("准备更新语音识别服务")) {
        voiceRuntimeUpgradeRef.current = true;
      }
      if (!voiceRuntimeUpgradeRef.current) return;

      if (event.phase === "ready" && event.message.includes("退出后")) {
        const progress = normalizeProgress(event);
        patchVoiceUpdateOverlay({
          phase: "ready",
          percent: progress.percent,
          message: progress.message,
        });
        return;
      }

      const progress = normalizeProgress(event);
      patchVoiceUpdateOverlay({
        phase: "downloading",
        percent: progress.percent,
        message: progress.message,
      });
    };

    const registerCloseHandler = async (): Promise<void> => {
      if (process.env.NODE_ENV === "development") return;
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        unlistenClose = await win.onCloseRequested(async (event) => {
          if (exitApplyTriggeredRef.current) return;

          const status = await fetchQuickerAgentUpdateStatus();
          if (!status?.pendingApplyOnExit) return;

          event.preventDefault();
          if (!tryBeginAppUpdateApply()) return;

          exitApplyTriggeredRef.current = true;
          showApplyingAppUpdateOverlay(
            status.installedVersion,
            status.remoteVersion,
          );
          try {
            // Silent install is handled once in Rust RunEvent::Exit (apply_pending_on_exit).
            await exitQuickerAgentForPendingUpdateInstall();
          } catch {
            exitApplyTriggeredRef.current = false;
            patchAppUpdateOverlay({
              phase: "ready",
              installedVersion: status.installedVersion,
              remoteVersion: status.remoteVersion,
              percent: 100,
              message: status.message ?? "更新已就绪",
              error: null,
            });
          }
        });
      } catch {
        // Ignore when window API is unavailable.
      }
    };

    void (async () => {
      try {
        const { getVersion } = await import("@tauri-apps/api/app");

        if (process.env.NODE_ENV === "development") {
          const installedVersion = (await getVersion()).trim();
          const update = await checkQuickerAgentUpdate(
            installedVersion,
            controller.signal,
          );
          if (update) {
            notifyDevBrowserUpdate(
              update.installedVersion,
              update.remoteVersion,
              update.downloadUrl,
            );
          }
          return;
        }

        unlistenStatus = await listenQuickerAgentUpdateStatus(handleAppStatus);
        unlistenProgress = await listenQuickerAgentUpdateProgress(handleAppProgress);
        unlistenVoice = await listenVoicePluginInstallProgress(handleVoiceProgress);

        patchAppUpdateOverlay({
          phase: "checking",
          percent: 0,
          message: "正在检查 QuickerAgent 更新…",
          error: null,
        });

        const status = await fetchQuickerAgentUpdateStatus();
        if (status) {
          handleAppStatus(status);
        }

        await registerCloseHandler();
      } catch {
        hideAppUpdateOverlaySlice();
      }
    })();

    return () => {
      controller.abort();
      void unlistenStatus?.();
      void unlistenProgress?.();
      void unlistenVoice?.();
      void unlistenClose?.();
    };
  }, []);

  return null;
}
