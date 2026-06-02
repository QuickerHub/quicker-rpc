"use client";

import { useCallback } from "react";
import { getShellPlatform, isTauriShell } from "@/lib/tauri-shell";

async function getAppWindow() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow();
}

function IconMinimize() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      <path d="M1 5.5h8" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function IconMaximize() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      <rect
        x="1.5"
        y="1.5"
        width="7"
        height="7"
        rx="0.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      <path
        d="M2 2l6 6M8 2L2 8"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function TauriWindowControls() {
  const platform = getShellPlatform();
  const showControls = isTauriShell() && platform !== "macos" && platform !== "web";

  const onMinimize = useCallback(async () => {
    const win = await getAppWindow();
    await win.minimize();
  }, []);

  const onToggleMaximize = useCallback(async () => {
    const win = await getAppWindow();
    await win.toggleMaximize();
  }, []);

  const onClose = useCallback(async () => {
    const win = await getAppWindow();
    await win.close();
  }, []);

  if (!showControls) return null;

  return (
    <div className="tauri-window-controls">
      <button
        type="button"
        className="tauri-window-control tauri-window-control--minimize"
        aria-label="最小化"
        title="最小化"
        onClick={() => void onMinimize()}
      >
        <IconMinimize />
      </button>
      <button
        type="button"
        className="tauri-window-control tauri-window-control--maximize"
        aria-label="最大化"
        title="最大化"
        onClick={() => void onToggleMaximize()}
      >
        <IconMaximize />
      </button>
      <button
        type="button"
        className="tauri-window-control tauri-window-control--close"
        aria-label="关闭"
        title="关闭"
        onClick={() => void onClose()}
      >
        <IconClose />
      </button>
    </div>
  );
}
