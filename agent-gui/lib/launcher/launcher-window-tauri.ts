"use client";

import { invokeDesktop } from "@/lib/desktop-bridge";
import {
  getDesktopShellKind,
  isDesktopShell,
} from "@/lib/desktop-shell";
import { pushAppMessage } from "@/lib/app-messages";

const LAUNCHER_ERROR_TOAST_ID = "launcher-window-error";

function formatLauncherInvokeError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  const text = String(error ?? "").trim();
  return text || "未知错误";
}

function reportLauncherError(action: string, error: unknown): void {
  const detail = formatLauncherInvokeError(error);
  console.error(`[launcher] ${action} failed:`, error);
  pushAppMessage({
    id: LAUNCHER_ERROR_TOAST_ID,
    kind: "error",
    title: "无法打开小窗",
    body: detail,
    autoDismissMs: 8_000,
  });
}

/** True when this webview is the dedicated launcher window (Tauri label or Electron role). */
export async function isLauncherDesktopWindow(): Promise<boolean> {
  const kind = getDesktopShellKind();
  if (kind === "electron") {
    return window.__ELECTRON_WINDOW__?.role === "launcher";
  }
  if (kind === "tauri") {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    return getCurrentWindow().label === "launcher";
  }
  return false;
}

/** @deprecated Use {@link isLauncherDesktopWindow} */
export const isLauncherTauriWindow = isLauncherDesktopWindow;

export async function desktopLauncherShow(expanded = false): Promise<boolean> {
  if (!isDesktopShell()) return false;
  try {
    await invokeDesktop("launcher_show", { expanded });
    return true;
  } catch (error) {
    reportLauncherError("launcher_show", error);
    return false;
  }
}

export async function desktopLauncherHide(): Promise<boolean> {
  if (!isDesktopShell()) return false;
  try {
    await invokeDesktop("launcher_hide");
    return true;
  } catch (error) {
    reportLauncherError("launcher_hide", error);
    return false;
  }
}

export async function desktopLauncherToggle(): Promise<boolean> {
  if (!isDesktopShell()) return false;
  try {
    await invokeDesktop("launcher_toggle");
    return true;
  } catch (error) {
    reportLauncherError("launcher_toggle", error);
    return false;
  }
}

export async function desktopLauncherExpand(): Promise<boolean> {
  if (!isDesktopShell()) return false;
  try {
    await invokeDesktop("launcher_expand");
    return true;
  } catch (error) {
    reportLauncherError("launcher_expand", error);
    return false;
  }
}

/** @deprecated Use {@link desktopLauncherShow} */
export const tauriLauncherShow = desktopLauncherShow;
/** @deprecated Use {@link desktopLauncherHide} */
export const tauriLauncherHide = desktopLauncherHide;
/** @deprecated Use {@link desktopLauncherToggle} */
export const tauriLauncherToggle = desktopLauncherToggle;
/** @deprecated Use {@link desktopLauncherExpand} */
export const tauriLauncherExpand = desktopLauncherExpand;
