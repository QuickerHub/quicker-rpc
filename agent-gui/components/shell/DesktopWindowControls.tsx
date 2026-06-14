"use client";

import { useCallback } from "react";
import { desktopWindowAction } from "@/lib/desktop-bridge";
import {
  useCustomDesktopWindowControls,
} from "@/lib/desktop-shell";

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

export function DesktopWindowControls() {
  const showControls = useCustomDesktopWindowControls();

  const onMinimize = useCallback(() => {
    void desktopWindowAction("minimize");
  }, []);

  const onToggleMaximize = useCallback(() => {
    void desktopWindowAction("toggleMaximize");
  }, []);

  const onClose = useCallback(() => {
    void desktopWindowAction("close");
  }, []);

  if (!showControls) return null;

  return (
    <div className="tauri-window-controls desktop-window-controls">
      <button
        type="button"
        className="tauri-window-control tauri-window-control--minimize"
        aria-label="最小化"
        title="最小化"
        onClick={onMinimize}
      >
        <IconMinimize />
      </button>
      <button
        type="button"
        className="tauri-window-control tauri-window-control--maximize"
        aria-label="最大化"
        title="最大化"
        onClick={onToggleMaximize}
      >
        <IconMaximize />
      </button>
      <button
        type="button"
        className="tauri-window-control tauri-window-control--close"
        aria-label="关闭"
        title="关闭"
        onClick={onClose}
      >
        <IconClose />
      </button>
    </div>
  );
}

/** @deprecated Use DesktopWindowControls */
export const TauriWindowControls = DesktopWindowControls;
