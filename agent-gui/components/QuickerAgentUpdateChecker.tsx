"use client";

import { useEffect, useRef } from "react";
import { pushAppMessage } from "@/lib/app-messages";
import { checkQuickerAgentUpdate } from "@/lib/quicker-agent-update";
import { isTauriShell } from "@/lib/tauri-shell";

const UPDATE_MESSAGE_ID = "quicker-agent-update";

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

function notifyUpdateAvailable(
  installedVersion: string,
  remoteVersion: string,
  downloadUrl: string,
): void {
  pushAppMessage({
    id: UPDATE_MESSAGE_ID,
    kind: "info",
    title: "QuickerAgent 更新",
    body: `有新版本 ${remoteVersion}（当前 ${installedVersion}）`,
    actions: [
      {
        label: "下载",
        primary: true,
        onClick: () => openDownloadUrl(downloadUrl),
      },
      {
        label: "稍后",
      },
    ],
  });
}

/** On each QuickerAgent (Tauri) launch, compare with Bitiful version.txt and prompt if newer. */
export function QuickerAgentUpdateChecker() {
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current || !isTauriShell()) return;
    startedRef.current = true;

    const controller = new AbortController();

    void (async () => {
      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        const installedVersion = (await getVersion()).trim();
        const update = await checkQuickerAgentUpdate(
          installedVersion,
          controller.signal,
        );
        if (!update) return;
        notifyUpdateAvailable(
          update.installedVersion,
          update.remoteVersion,
          update.downloadUrl,
        );
      } catch {
        // Ignore network errors on startup.
      }
    })();

    return () => controller.abort();
  }, []);

  return null;
}
