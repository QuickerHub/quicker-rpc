"use client";

import { pushAppMessage } from "@/lib/app-messages";
import { isTauriShell } from "@/lib/tauri-shell";

const LAUNCHER_ERROR_TOAST_ID = "launcher-window-error";

async function invokeLauncher<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

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

export async function isLauncherTauriWindow(): Promise<boolean> {
  if (!isTauriShell()) return false;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow().label === "launcher";
}

export async function tauriLauncherShow(expanded = false): Promise<boolean> {
  if (!isTauriShell()) return false;
  try {
    await invokeLauncher("launcher_show", { expanded });
    return true;
  } catch (error) {
    reportLauncherError("launcher_show", error);
    return false;
  }
}

export async function tauriLauncherHide(): Promise<boolean> {
  if (!isTauriShell()) return false;
  try {
    await invokeLauncher("launcher_hide");
    return true;
  } catch (error) {
    reportLauncherError("launcher_hide", error);
    return false;
  }
}

export async function tauriLauncherToggle(): Promise<boolean> {
  if (!isTauriShell()) return false;
  try {
    await invokeLauncher("launcher_toggle");
    return true;
  } catch (error) {
    reportLauncherError("launcher_toggle", error);
    return false;
  }
}

export async function tauriLauncherExpand(): Promise<boolean> {
  if (!isTauriShell()) return false;
  try {
    await invokeLauncher("launcher_expand");
    return true;
  } catch (error) {
    reportLauncherError("launcher_expand", error);
    return false;
  }
}
