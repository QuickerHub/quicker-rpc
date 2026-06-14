"use client";

import { invokeDesktop } from "@/lib/desktop-bridge";
import {
  getShellPlatform,
  isElectronShell,
  usesNativeWindowControlsOverlay,
} from "@/lib/desktop-shell";

export const ELECTRON_TITLEBAR_OVERLAY_HEIGHT_PX = 32;

function isMainElectronWindow(): boolean {
  if (typeof window === "undefined") return false;
  return window.__ELECTRON_WINDOW__?.role === "main";
}

/** Pick light/dark glyph color for WCO buttons from a CSS background color. */
export function symbolColorForBackground(backgroundColor: string): string {
  const match = backgroundColor.match(
    /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i,
  );
  if (!match) return "#e8eaed";
  const r = Number(match[1]);
  const g = Number(match[2]);
  const b = Number(match[3]);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "#1f2937" : "#e8eaed";
}

function readTitlebarOverlayColors(): { color: string; symbolColor: string } {
  const titlebar = document.querySelector<HTMLElement>(".app-titlebar");
  const color = titlebar
    ? getComputedStyle(titlebar).backgroundColor
    : "rgb(35, 39, 47)";
  return {
    color,
    symbolColor: symbolColorForBackground(color),
  };
}

/** Push titlebar colors to Electron WCO (no-op on web/Tauri/macOS). */
export async function syncElectronTitleBarOverlay(): Promise<void> {
  if (!isElectronShell() || !usesNativeWindowControlsOverlay()) return;
  if (!isMainElectronWindow()) return;
  if (getShellPlatform() === "web") return;

  const { color, symbolColor } = readTitlebarOverlayColors();
  await invokeDesktop("set_titlebar_overlay", {
    color,
    symbolColor,
    height: ELECTRON_TITLEBAR_OVERLAY_HEIGHT_PX,
  });
}
