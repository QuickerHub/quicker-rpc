"use client";

import { useEffect, useRef } from "react";
import {
  getAppInstalledVersion,
  showAppExitOverlay,
} from "@/lib/app-exit-overlay";
import {
  resetAppUpdateApply,
  tryBeginAppUpdateApply,
} from "@/lib/app-update-apply-guard";
import {
  patchAppUpdateOverlay,
  showApplyingAppUpdateOverlay,
} from "@/lib/app-update-overlay";
import { flushPendingChatStoreSaveAsync } from "@/lib/chat-store";
import {
  forceExitDesktop,
  invokeDesktop,
  listenDesktop,
} from "@/lib/desktop-bridge";
import { isDesktopShell } from "@/lib/desktop-shell";
import {
  getPendingOfficialUpdateDescriptor,
  installPendingOfficialUpdateOnExit,
  isPendingOfficialUpdateDownloaded,
} from "@/lib/quicker-agent-official-updater";

const APP_REQUEST_EXIT_EVENT = "app-request-exit";
const FORCE_EXIT_AFTER_MS = 3_000;

function scheduleForceExit(): void {
  window.setTimeout(() => {
    void forceExitDesktop();
  }, FORCE_EXIT_AFTER_MS);
}

function waitForOverlayPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

/**
 * Release builds: tray quit triggers graceful shutdown in the desktop shell.
 * Closing the main window may hide to tray (Tauri) or request exit (Electron).
 */
export function QuickerAgentExitHandler() {
  const exitInProgressRef = useRef(false);

  useEffect(() => {
    if (!isDesktopShell() || process.env.NODE_ENV === "development") return;

    let unlistenTrayExit: (() => void) | undefined;

    const performExit = async (): Promise<void> => {
      if (exitInProgressRef.current) {
        void forceExitDesktop();
        return;
      }
      exitInProgressRef.current = true;
      scheduleForceExit();

      try {
        if (isPendingOfficialUpdateDownloaded()) {
          const update = getPendingOfficialUpdateDescriptor();
          if (update && tryBeginAppUpdateApply()) {
            showApplyingAppUpdateOverlay(
              getAppInstalledVersion(),
              update.version,
            );
            try {
              await Promise.race([
                installPendingOfficialUpdateOnExit((progress) => {
                  patchAppUpdateOverlay({
                    phase: "applying",
                    percent: progress.percent,
                    message: progress.message,
                    error: null,
                  });
                }),
                new Promise<never>((_, reject) => {
                  window.setTimeout(
                    () => reject(new Error("更新安装超时")),
                    120_000,
                  );
                }),
              ]);
            } catch {
              exitInProgressRef.current = false;
              resetAppUpdateApply();
              patchAppUpdateOverlay({
                phase: "ready",
                remoteVersion: update.version,
                percent: 100,
                message: "更新已就绪，可立即安装并重启",
                error: null,
              });
              return;
            }
          }
        }

        showAppExitOverlay("正在保存对话…");
        await waitForOverlayPaint();
        await Promise.race([
          flushPendingChatStoreSaveAsync(),
          new Promise<void>((resolve) => {
            window.setTimeout(resolve, 8_000);
          }),
        ]);

        showAppExitOverlay("正在退出…");
        await waitForOverlayPaint();

        void invokeDesktop("graceful_exit").catch(() => {
          void forceExitDesktop();
        });
      } catch {
        void forceExitDesktop();
      }
    };

    void (async () => {
      try {
        unlistenTrayExit = await listenDesktop(APP_REQUEST_EXIT_EVENT, () => {
          void performExit();
        });
      } catch {
        // Ignore when desktop APIs are unavailable.
      }
    })();

    return () => {
      void unlistenTrayExit?.();
    };
  }, []);

  return null;
}
