"use client";

import { useEffect, useRef } from "react";
import { pushAppMessage } from "@/lib/app-messages";
import { checkQuickerAgentUpdate } from "@/lib/quicker-agent-update";
import {
  applyQuickerAgentUpdateAndExit,
  fetchQuickerAgentUpdateStatus,
  listenQuickerAgentUpdateProgress,
  listenQuickerAgentUpdateStatus,
  skipQuickerAgentUpdateVersion,
  type QuickerAgentUpdateStatusDto,
} from "@/lib/quicker-agent-update-tauri";
import { listenVoicePluginInstallProgress } from "@/lib/voice-input/voice-input-tauri";
import { isTauriShell } from "@/lib/tauri-shell";

const APP_UPDATE_MESSAGE_ID = "quicker-agent-update";
const VOICE_RUNTIME_UPDATE_MESSAGE_ID = "voice-runtime-update";

function notifyAppUpdateReady(status: QuickerAgentUpdateStatusDto): void {
  const remote = status.remoteVersion ?? "?";
  pushAppMessage({
    id: APP_UPDATE_MESSAGE_ID,
    kind: "info",
    title: "QuickerAgent 更新",
    body: `新版本 ${remote} 已下载（当前 ${status.installedVersion}），退出后将自动安装。`,
    actions: [
      {
        label: "立即更新并重启",
        primary: true,
        onClick: () => {
          void applyQuickerAgentUpdateAndExit();
        },
      },
      {
        label: "跳过此版本",
        onClick: () => {
          if (status.remoteVersion) {
            void skipQuickerAgentUpdateVersion(status.remoteVersion);
          }
        },
      },
    ],
  });
}

function notifyVoiceRuntimeUpdateReady(): void {
  pushAppMessage({
    id: VOICE_RUNTIME_UPDATE_MESSAGE_ID,
    kind: "info",
    title: "语音服务更新",
    body: "语音识别服务更新已下载，退出 QuickerAgent 后将自动安装。",
  });
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

/** Tauri release: Rust background download + apply on exit. Dev/browser: legacy prompt. */
export function QuickerAgentUpdateChecker() {
  const startedRef = useRef(false);
  const appReadyNotifiedRef = useRef(false);
  const voiceReadyNotifiedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current || !isTauriShell()) return;
    startedRef.current = true;

    const controller = new AbortController();
    let unlistenStatus: (() => void) | undefined;
    let unlistenProgress: (() => void) | undefined;
    let unlistenVoice: (() => void) | undefined;

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

        unlistenStatus = await listenQuickerAgentUpdateStatus((status) => {
          if (status.phase === "ready" && status.pendingApplyOnExit) {
            if (appReadyNotifiedRef.current) return;
            appReadyNotifiedRef.current = true;
            notifyAppUpdateReady(status);
          }
        });

        unlistenProgress = await listenQuickerAgentUpdateProgress(() => {
          // Progress is surfaced via status toast when ready; no per-tick UI yet.
        });

        unlistenVoice = await listenVoicePluginInstallProgress((event) => {
          if (event.phase !== "ready") return;
          if (!event.message.includes("退出后")) return;
          if (voiceReadyNotifiedRef.current) return;
          voiceReadyNotifiedRef.current = true;
          notifyVoiceRuntimeUpdateReady();
        });

        const status = await fetchQuickerAgentUpdateStatus();
        if (status?.phase === "ready" && status.pendingApplyOnExit) {
          if (!appReadyNotifiedRef.current) {
            appReadyNotifiedRef.current = true;
            notifyAppUpdateReady(status);
          }
        }
      } catch {
        // Ignore network / IPC errors on startup.
      }
    })();

    return () => {
      controller.abort();
      void unlistenStatus?.();
      void unlistenProgress?.();
      void unlistenVoice?.();
    };
  }, []);

  return null;
}
