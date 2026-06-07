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
import {
  getPendingOfficialUpdate,
  installPendingOfficialUpdateOnExit,
  isPendingOfficialUpdateDownloaded,
} from "@/lib/quicker-agent-official-updater";
import { isTauriShell } from "@/lib/tauri-shell";

const APP_REQUEST_EXIT_EVENT = "app-request-exit";

function waitForOverlayPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

/** Release builds: intercept close / tray quit, show overlay, graceful shutdown in Rust. */
export function QuickerAgentExitHandler() {
  const exitInProgressRef = useRef(false);

  useEffect(() => {
    if (!isTauriShell() || process.env.NODE_ENV === "development") return;

    let unlistenClose: (() => void) | undefined;
    let unlistenTrayExit: (() => void) | undefined;

    const performExit = async (): Promise<void> => {
      if (exitInProgressRef.current) return;
      exitInProgressRef.current = true;

      try {
        if (isPendingOfficialUpdateDownloaded()) {
          const update = getPendingOfficialUpdate();
          if (update && tryBeginAppUpdateApply()) {
            showApplyingAppUpdateOverlay(
              getAppInstalledVersion(),
              update.version,
            );
            try {
              await Promise.race([
                installPendingOfficialUpdateOnExit(),
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

        showAppExitOverlay("正在关闭后台服务…");
        await waitForOverlayPaint();

        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("graceful_exit");
      } catch {
        exitInProgressRef.current = false;
      }
    };

    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const { listen } = await import("@tauri-apps/api/event");
        const win = getCurrentWindow();

        unlistenClose = await win.onCloseRequested((event) => {
          event.preventDefault();
          void performExit();
        });

        unlistenTrayExit = await listen(APP_REQUEST_EXIT_EVENT, () => {
          void performExit();
        });
      } catch {
        // Ignore when Tauri APIs are unavailable.
      }
    })();

    return () => {
      void unlistenClose?.();
      void unlistenTrayExit?.();
    };
  }, []);

  return null;
}
