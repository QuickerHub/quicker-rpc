"use client";

import { useEffect, useRef } from "react";
import { pushAppMessage } from "@/lib/app-messages";
import {
  getAppUpdateOverlayState,
  hideAppUpdateOverlaySlice,
  patchAppUpdateOverlay,
  patchVoiceUpdateOverlay,
  type AppUpdateOverlaySlice,
} from "@/lib/app-update-overlay";
import { resetAppUpdateApply } from "@/lib/app-update-apply-guard";
import { setAppInstalledVersion } from "@/lib/app-exit-overlay";
import {
  checkOfficialQuickerAgentUpdate,
  clearPendingOfficialUpdate,
  downloadPendingOfficialUpdate,
  type OfficialUpdateProgress,
} from "@/lib/quicker-agent-official-updater";
import { checkQuickerAgentUpdate } from "@/lib/quicker-agent-update";
import {
  completeVoiceUpdateToast,
  dismissAppUpdateToast,
  syncAppUpdateToast,
  syncVoiceUpdateToast,
  waitForAppInteractive,
} from "@/lib/quicker-agent-update-ui";
import {
  listenVoicePluginInstallProgress,
  type VoiceInstallProgressEvent,
} from "@/lib/voice-input/voice-input-tauri";
import { getDesktopAppVersion } from "@/lib/desktop-app-version";
import { isDesktopShell } from "@/lib/desktop-shell";

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

function patchAppAndSyncToast(patch: Partial<AppUpdateOverlaySlice>): void {
  patchAppUpdateOverlay(patch);
  syncAppUpdateToast(getAppUpdateOverlayState().app);
}

function syncAppOverlayFromOfficialProgress(event: OfficialUpdateProgress): void {
  patchAppAndSyncToast({
    phase: event.phase === "checking" ? "checking" : "downloading",
    remoteVersion: event.remoteVersion ?? undefined,
    percent: event.percent,
    message: event.message,
    error: null,
  });
}

/** Desktop release: Tauri plugin-updater or Electron electron-updater. Dev/browser: Bitiful prompt. */
export function QuickerAgentUpdateChecker() {
  const startedRef = useRef(false);
  const voiceRuntimeUpgradeRef = useRef(false);
  useEffect(() => {
    if (startedRef.current || !isDesktopShell()) return;
    startedRef.current = true;

    const controller = new AbortController();
    let unlistenVoice: (() => void) | undefined;

    const handleVoiceProgress = (event: VoiceInstallProgressEvent): void => {
      if (event.message.includes("准备更新语音识别服务")) {
        voiceRuntimeUpgradeRef.current = true;
      }
      if (!voiceRuntimeUpgradeRef.current) return;

      const progress = normalizeProgress(event);

      if (event.phase === "done") {
        completeVoiceUpdateToast(progress.message, "success");
        voiceRuntimeUpgradeRef.current = false;
        return;
      }

      if (event.phase === "error") {
        completeVoiceUpdateToast(progress.message, "warning");
        voiceRuntimeUpgradeRef.current = false;
        return;
      }

      if (event.phase === "ready") {
        patchVoiceUpdateOverlay({
          phase: "ready",
          percent: progress.percent,
          message: progress.message,
        });
        syncVoiceUpdateToast({
          phase: "ready",
          percent: progress.percent,
          message: progress.message,
        });
        return;
      }

      patchVoiceUpdateOverlay({
        phase: "downloading",
        percent: progress.percent,
        message: progress.message,
      });
      syncVoiceUpdateToast({
        phase: "downloading",
        percent: progress.percent,
        message: progress.message,
      });
    };

    void (async () => {
      try {
        if (process.env.NODE_ENV === "development") {
          const installedVersion = await getDesktopAppVersion();
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

        await waitForAppInteractive();

        unlistenVoice = await listenVoicePluginInstallProgress(handleVoiceProgress);

        const installedVersion = await getDesktopAppVersion();
        setAppInstalledVersion(installedVersion);

        dismissAppUpdateToast();

        const update = await checkOfficialQuickerAgentUpdate();
        if (!update) {
          hideAppUpdateOverlaySlice();
          dismissAppUpdateToast();
          return;
        }

        patchAppAndSyncToast({
          phase: "downloading",
          installedVersion,
          remoteVersion: update.version,
          percent: 0,
          message: `正在后台下载 QuickerAgent ${update.version}…`,
          error: null,
        });

        await downloadPendingOfficialUpdate((progress) => {
          syncAppOverlayFromOfficialProgress(progress);
        });

        patchAppAndSyncToast({
          phase: "ready",
          installedVersion,
          remoteVersion: update.version,
          percent: 100,
          message: "更新已就绪，可立即安装并重启",
          error: null,
        });

      } catch (err) {
        clearPendingOfficialUpdate();
        resetAppUpdateApply();
        patchAppAndSyncToast({
          phase: "error",
          percent: 0,
          message: err instanceof Error ? err.message : "更新失败",
          error: err instanceof Error ? err.message : "更新失败",
        });
      }
    })();

    return () => {
      controller.abort();
      void unlistenVoice?.();
    };
  }, []);

  return null;
}
