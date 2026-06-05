"use client";

import { isTauriShell } from "@/lib/tauri-shell";

async function invokeLauncher<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

export async function isLauncherTauriWindow(): Promise<boolean> {
  if (!isTauriShell()) return false;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow().label === "launcher";
}

export function tauriLauncherShow(expanded = false): void {
  void invokeLauncher("launcher_show", { expanded }).catch((error) => {
    console.error("[launcher] launcher_show failed:", error);
  });
}

export function tauriLauncherHide(): void {
  void invokeLauncher("launcher_hide");
}

export function tauriLauncherToggle(): void {
  void invokeLauncher("launcher_toggle");
}

export function tauriLauncherExpand(): void {
  void invokeLauncher("launcher_expand");
}
