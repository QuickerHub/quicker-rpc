"use client";

import { isTauriShell } from "@/lib/tauri-shell";
import {
  postLauncherOpened,
  postLauncherSessionClear,
} from "@/lib/launcher/launcher-bridge";
import {
  isLauncherTauriWindow,
  tauriLauncherHide,
  tauriLauncherShow,
  tauriLauncherToggle,
} from "@/lib/launcher/launcher-window-tauri";

function notifyLauncherOpened(): void {
  postLauncherOpened();
  postLauncherSessionClear();
}

const LAUNCHER_POPUP_NAME = "quicker-agent-launcher";
const LAUNCHER_POPUP_FEATURES =
  "popup=yes,width=680,height=520,menubar=no,toolbar=no,location=no,status=no,resizable=yes";

let launcherPopup: Window | null = null;

export function isLauncherRoute(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.pathname === "/launcher";
}

export function openLauncherWindow(): void {
  if (typeof window === "undefined") return;
  if (isTauriShell()) {
    tauriLauncherShow(false);
    notifyLauncherOpened();
    return;
  }
  if (isLauncherRoute()) {
    window.focus();
    return;
  }
  if (launcherPopup && !launcherPopup.closed) {
    launcherPopup.focus();
    notifyLauncherOpened();
    return;
  }
  launcherPopup = window.open(
    "/launcher",
    LAUNCHER_POPUP_NAME,
    LAUNCHER_POPUP_FEATURES,
  );
}

/** Window size is fixed; kept for callers that run after the first submit. */
export function expandLauncherPopup(): void {
  // no-op — launcher uses a fixed height so the composer stays put
}

export function toggleLauncherWindow(): void {
  if (isTauriShell()) {
    tauriLauncherToggle();
    return;
  }
  if (launcherPopup && !launcherPopup.closed) {
    postLauncherSessionClear();
    launcherPopup.close();
    launcherPopup = null;
    return;
  }
  openLauncherWindow();
}

export function dismissLauncherWindow(): void {
  if (typeof window === "undefined") return;
  postLauncherSessionClear();
  if (isTauriShell()) {
    void isLauncherTauriWindow().then((isLauncherWindow) => {
      if (isLauncherWindow) {
        tauriLauncherHide();
      }
    });
    return;
  }
  if (isLauncherRoute()) {
    if (window.opener && !window.opener.closed) {
      window.close();
      return;
    }
    return;
  }
  if (launcherPopup && !launcherPopup.closed) {
    launcherPopup.close();
  }
  launcherPopup = null;
}

export function openLauncherWindowExpanded(): void {
  openLauncherWindow();
}
