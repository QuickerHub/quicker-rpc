"use client";

import { useEffect, useRef } from "react";
import { checkQuickerAgentUpdate } from "@/lib/quicker-agent-update";
import { isTauriShell } from "@/lib/tauri-shell";

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

async function promptForUpdate(
  installedVersion: string,
  remoteVersion: string,
  downloadUrl: string,
): Promise<void> {
  const { ask } = await import("@tauri-apps/plugin-dialog");
  const message =
    `QuickerAgent 有新版本 ${remoteVersion}（当前 ${installedVersion}）。\n` +
    "是否打开浏览器下载最新安装包？";
  const confirmed = await ask(message, {
    title: "QuickerAgent 更新",
    kind: "info",
    okLabel: "下载",
    cancelLabel: "稍后",
  });
  if (confirmed) {
    await openDownloadUrl(downloadUrl);
  }
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
        await promptForUpdate(
          update.installedVersion,
          update.remoteVersion,
          update.downloadUrl,
        );
      } catch {
        // Ignore network / dialog errors on startup.
      }
    })();

    return () => controller.abort();
  }, []);

  return null;
}
