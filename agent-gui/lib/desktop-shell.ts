"use client";

import { useEffect, useState } from "react";

export type DesktopShellKind = "tauri" | "electron" | "web";

declare global {
  interface Window {
    __DESKTOP_SHELL__?: string;
    __ELECTRON_WINDOW__?: {
      role: "main" | "launcher" | string;
    };
    __ELECTRON__?: {
      invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
      windowAction: (
        action: "minimize" | "toggleMaximize" | "close",
      ) => Promise<void>;
      on: (event: string, handler: (payload: unknown) => void) => () => void;
    };
  }
}

/** Detect which desktop shell hosts the UI (if any). */
export function getDesktopShellKind(): DesktopShellKind {
  if (typeof window === "undefined") return "web";
  if (window.__DESKTOP_SHELL__ === "electron" || "__ELECTRON__" in window) {
    return "electron";
  }
  if ("__TAURI_INTERNALS__" in window || "__TAURI__" in window) {
    return "tauri";
  }
  return "web";
}

export function isDesktopShell(): boolean {
  return getDesktopShellKind() !== "web";
}

export function isElectronShell(): boolean {
  return getDesktopShellKind() === "electron";
}

/** True when the UI runs inside a Tauri webview (not plain browser or Electron). */
export function isTauriShell(): boolean {
  return getDesktopShellKind() === "tauri";
}

/** True when running inside Tauri dev (`tauri dev` / `dev.ps1 -Tauri`). */
export function isTauriDevShell(): boolean {
  return isTauriShell() && process.env.NODE_ENV === "development";
}

/** True when running inside Electron dev (`electron:dev` / `dev.ps1 -Electron`). */
export function isElectronDevShell(): boolean {
  return isElectronShell() && process.env.NODE_ENV === "development";
}

/** SSR-safe: `"web"` until after mount. */
export function useDesktopShellKind(): DesktopShellKind {
  const [kind, setKind] = useState<DesktopShellKind>("web");
  useEffect(() => {
    setKind(getDesktopShellKind());
  }, []);
  return kind;
}

/** SSR-safe: false until after mount, then matches {@link isDesktopShell}. */
export function useDesktopShell(): boolean {
  const [value, setValue] = useState(false);
  useEffect(() => {
    setValue(isDesktopShell());
  }, []);
  return value;
}

/** SSR-safe: false until after mount, then matches {@link isTauriShell}. */
export function useTauriShell(): boolean {
  const [isTauri, setIsTauri] = useState(false);
  useEffect(() => {
    setIsTauri(isTauriShell());
  }, []);
  return isTauri;
}

export type ShellPlatform = "windows" | "macos" | "linux" | "web";

export function getShellPlatform(): ShellPlatform {
  if (!isDesktopShell()) return "web";
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "macos";
  return "linux";
}

/** SSR-safe: `"web"` until after mount, then matches {@link getShellPlatform}. */
export function useShellPlatform(): ShellPlatform {
  const [platform, setPlatform] = useState<ShellPlatform>("web");
  useEffect(() => {
    setPlatform(getShellPlatform());
  }, []);
  return platform;
}

export function usesFramelessTitlebar(): boolean {
  if (!isDesktopShell()) return false;
  return getShellPlatform() !== "macos";
}

/** Electron Win/Linux: native caption buttons via Window Controls Overlay (VS Code style). */
export function usesNativeWindowControlsOverlay(): boolean {
  return isElectronShell() && getShellPlatform() !== "macos";
}

/** SSR-safe: false until after mount, then matches {@link usesNativeWindowControlsOverlay}. */
export function useNativeWindowControlsOverlay(): boolean {
  const [value, setValue] = useState(false);
  useEffect(() => {
    setValue(usesNativeWindowControlsOverlay());
  }, []);
  return value;
}

/** Tauri Win/Linux frameless windows still use custom HTML min/max/close buttons. */
export function usesCustomDesktopWindowControls(): boolean {
  if (!isDesktopShell()) return false;
  if (getShellPlatform() === "macos") return false;
  return !usesNativeWindowControlsOverlay();
}

/** SSR-safe: false until after mount, then matches {@link usesCustomDesktopWindowControls}. */
export function useCustomDesktopWindowControls(): boolean {
  const [value, setValue] = useState(false);
  useEffect(() => {
    setValue(usesCustomDesktopWindowControls());
  }, []);
  return value;
}

export function usesMacOverlayTitlebar(): boolean {
  return isDesktopShell() && getShellPlatform() === "macos";
}
