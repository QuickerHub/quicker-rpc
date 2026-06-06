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
  checkOfficialQuickerAgentUpdate,
  clearPendingOfficialUpdate,
  downloadPendingOfficialUpdate,
  getPendingOfficialUpdate,
  installPendingOfficialUpdateOnExit,
  isPendingOfficialUpdateDownloaded,
  type OfficialUpdateProgress,
} from "@/lib/quicker-agent-official-updater";
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

function syncAppOverlayFromOfficialProgress(event: OfficialUpdateProgress): void {
  patchAppUpdateOverlay({
    phase: event.phase === "checking" ? "checking" : "downloading",
    remoteVersion: event.remoteVersion ?? undefined,
    percent: event.percent,
    message: event.message,
    error: null,
  });
}

/** Tauri release: official updater plugin. Dev/browser: legacy Bitiful prompt. */
export function QuickerAgentUpdateChecker() {
  const startedRef = useRef(false);
  const voiceRuntimeUpgradeRef = useRef(false);
  const exitApplyTriggeredRef = useRef(false);

  useEffect(() => {
    if (startedRef.current || !isTauriShell()) return;
    startedRef.current = true;

    const controller = new AbortController();
    let unlistenVoice: (() => void) | undefined;
    let unlistenClose: (() => void) | undefined;

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
          if (!isPendingOfficialUpdateDownloaded()) return;

          const update = getPendingOfficialUpdate();
          if (!update) return;
          if (!tryBeginAppUpdateApply()) return;

          event.preventDefault();
          exitApplyTriggeredRef.current = true;
          showApplyingAppUpdateOverlay("", update.version);
          try {
            await Promise.race([
              installPendingOfficialUpdateOnExit(),
              new Promise<never>((_, reject) => {
                window.setTimeout(
                  () => reject(new Error("更新安装超时，请从托盘菜单退出后手动安装")),
                  120_000,
                );
              }),
            ]);
          } catch {
            exitApplyTriggeredRef.current = false;
            patchAppUpdateOverlay({
              phase: "ready",
              remoteVersion: update.version,
              percent: 100,
              message: "更新已就绪，可立即安装并重启",
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

        unlistenVoice = await listenVoicePluginInstallProgress(handleVoiceProgress);

        const installedVersion = (await getVersion()).trim();
        patchAppUpdateOverlay({
          phase: "checking",
          installedVersion,
          percent: 0,
          message: "正在检查 QuickerAgent 更新…",
          error: null,
        });

        const update = await checkOfficialQuickerAgentUpdate();
        if (!update) {
          hideAppUpdateOverlaySlice();
          await registerCloseHandler();
          return;
        }

        patchAppUpdateOverlay({
          phase: "downloading",
          installedVersion,
          remoteVersion: update.version,
          percent: 0,
          message: `正在下载 QuickerAgent ${update.version}…`,
          error: null,
        });

        await downloadPendingOfficialUpdate((progress) => {
          syncAppOverlayFromOfficialProgress(progress);
        });

        patchAppUpdateOverlay({
          phase: "ready",
          installedVersion,
          remoteVersion: update.version,
          percent: 100,
          message: "更新已就绪，可立即安装并重启",
          error: null,
        });

        await registerCloseHandler();
      } catch (err) {
        clearPendingOfficialUpdate();
        patchAppUpdateOverlay({
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
      void unlistenClose?.();
    };
  }, []);

  return null;
}
