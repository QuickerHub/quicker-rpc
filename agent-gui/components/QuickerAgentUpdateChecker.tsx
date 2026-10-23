"use client";

import { useEffect, useRef } from "react";
import { pushAppMessage } from "@/lib/app-messages";
import {
  getAppUpdateOverlayState,
  hideAppUpdateOverlaySlice,
  patchAppUpdateOverlay,
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
  dismissAppUpdateToast,
  syncAppUpdateToast,
  waitForAppInteractive,
} from "@/lib/quicker-agent-update-ui";
import { getDesktopAppVersion } from "@/lib/desktop-app-version";
import { isDesktopShell } from "@/lib/desktop-shell";

const APP_UPDATE_MESSAGE_ID = "quicker-agent-update-dev";

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

function isBenignUpdateCheckError(err: unknown): boolean {
  const text = err instanceof Error ? err.message : String(err);
  return /404|403|not found|enotfound|econnrefused|etimedout|network error|httperror|ns_error|更新服务未初始化|没有待下载/i.test(text);
}

/** Desktop release: Tauri plugin-updater or Electron electron-updater. Dev/browser: Bitiful prompt. */
export function QuickerAgentUpdateChecker() {
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current || !isDesktopShell()) return;
    startedRef.current = true;

    const controller = new AbortController();

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
        if (isBenignUpdateCheckError(err)) {
          hideAppUpdateOverlaySlice();
          dismissAppUpdateToast();
          return;
        }
        patchAppAndSyncToast({
          phase: "error",
          percent: 0,
          message: err instanceof Error ? err.message.split("\n")[0] : "更新失败",
          error: err instanceof Error ? err.message.split("\n")[0] : "更新失败",
        });
      }
    })();

    return () => {
      controller.abort();
    };
  }, []);

  return null;
}
