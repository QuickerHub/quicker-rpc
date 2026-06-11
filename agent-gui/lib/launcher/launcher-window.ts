"use client";

import { isDesktopShell } from "@/lib/desktop-shell";
import {
  postLauncherOpened,
  postLauncherSessionClear,
} from "@/lib/launcher/launcher-bridge";
import {
  desktopLauncherHide,
  desktopLauncherShow,
  desktopLauncherToggle,
  isLauncherDesktopWindow,
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

export async function openLauncherWindow(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (isDesktopShell()) {
    const ok = await desktopLauncherShow(false);
    if (ok) {
      notifyLauncherOpened();
    }
    return ok;
  }
  if (isLauncherRoute()) {
    window.focus();
    return true;
  }
  if (launcherPopup && !launcherPopup.closed) {
    launcherPopup.focus();
    notifyLauncherOpened();
    return true;
  }
  launcherPopup = window.open(
    "/launcher",
    LAUNCHER_POPUP_NAME,
    LAUNCHER_POPUP_FEATURES,
  );
  if (!launcherPopup) {
    return false;
  }
  notifyLauncherOpened();
  return true;
}

/** Window size is fixed; kept for callers that run after the first submit. */
export function expandLauncherPopup(): void {
  // no-op — launcher uses a fixed height so the composer stays put
}

export async function toggleLauncherWindow(): Promise<boolean> {
  if (isDesktopShell()) {
    return desktopLauncherToggle();
  }
  if (launcherPopup && !launcherPopup.closed) {
    postLauncherSessionClear();
    launcherPopup.close();
    launcherPopup = null;
    return true;
  }
  return openLauncherWindow();
}

export function dismissLauncherWindow(): void {
  if (typeof window === "undefined") return;
  if (isDesktopShell()) {
    void isLauncherDesktopWindow().then((isLauncherWindow) => {
      if (isLauncherWindow) {
        void desktopLauncherHide();
      }
    });
    return;
  }
  postLauncherSessionClear();
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

export async function openLauncherWindowExpanded(): Promise<boolean> {
  return openLauncherWindow();
}
