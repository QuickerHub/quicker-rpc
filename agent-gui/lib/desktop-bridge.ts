"use client";

import { getDesktopShellKind } from "@/lib/desktop-shell";

export type DesktopWindowAction = "minimize" | "toggleMaximize" | "close";

/**
 * Unified desktop IPC entry. Tauri uses invoke; Electron uses preload bridge.
 */
export async function invokeDesktop<T = unknown>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const kind = getDesktopShellKind();
  if (kind === "tauri") {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(command, args);
  }
  if (kind === "electron") {
    const bridge = window.__ELECTRON__;
    if (!bridge?.invoke) {
      throw new Error("Electron preload bridge is not available");
    }
    return bridge.invoke(command, args) as Promise<T>;
  }
  throw new Error(`invokeDesktop("${command}") requires a desktop shell`);
}

/** Subscribe to desktop shell events (tray quit, etc.). */
export async function listenDesktop(
  event: string,
  handler: (payload: unknown) => void,
): Promise<() => void> {
  const kind = getDesktopShellKind();
  if (kind === "tauri") {
    const { listen } = await import("@tauri-apps/api/event");
    const unlisten = await listen(event, (e) => {
      handler(e.payload);
    });
    return () => {
      void unlisten();
    };
  }
  if (kind === "electron") {
    const bridge = window.__ELECTRON__;
    if (!bridge?.on) {
      return () => {};
    }
    return bridge.on(event, handler);
  }
  return () => {};
}

export async function desktopWindowAction(action: DesktopWindowAction): Promise<void> {
  const kind = getDesktopShellKind();
  if (kind === "tauri") {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    if (action === "minimize") await win.minimize();
    else if (action === "toggleMaximize") await win.toggleMaximize();
    else await win.close();
    return;
  }
  if (kind === "electron") {
    const bridge = window.__ELECTRON__;
    if (!bridge?.windowAction) {
      throw new Error("Electron window bridge is not available");
    }
    await bridge.windowAction(action);
    return;
  }
  throw new Error(`desktopWindowAction("${action}") requires a desktop shell`);
}

/** Force exit when graceful shutdown stalls. */
export async function forceExitDesktop(): Promise<void> {
  const kind = getDesktopShellKind();
  if (kind === "tauri") {
    try {
      const { exit } = await import("@tauri-apps/plugin-process");
      await exit(0);
      return;
    } catch {
      // Fall through to graceful_exit.
    }
  }
  try {
    await invokeDesktop("graceful_exit");
  } catch {
    // Last resort for browser-only builds is a no-op.
  }
}
