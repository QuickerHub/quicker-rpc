"use client";

/** True when the UI runs inside a Tauri webview (not plain browser). */
export function isTauriShell(): boolean {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window;
}

export type ShellPlatform = "windows" | "macos" | "linux" | "web";

export function getShellPlatform(): ShellPlatform {
  if (!isTauriShell()) return "web";
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "macos";
  return "linux";
}

/** Frameless Tauri window with in-app titlebar (custom controls on Windows/Linux). */
export function usesFramelessTitlebar(): boolean {
  if (!isTauriShell()) return false;
  return getShellPlatform() !== "macos";
}

/** macOS overlay titlebar: native traffic lights, content extends under title bar. */
export function usesMacOverlayTitlebar(): boolean {
  return isTauriShell() && getShellPlatform() === "macos";
}
