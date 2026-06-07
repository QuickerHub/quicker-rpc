"use client";

import { useSyncExternalStore } from "react";

export type AppExitOverlayState = {
  visible: boolean;
  message: string;
};

const hidden: AppExitOverlayState = {
  visible: false,
  message: "",
};

let state: AppExitOverlayState = hidden;
const serverSnapshot: AppExitOverlayState = hidden;
const listeners = new Set<() => void>();

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function getAppExitOverlayState(): AppExitOverlayState {
  return state;
}

export function showAppExitOverlay(message = "正在退出…"): void {
  state = { visible: true, message };
  notifyListeners();
}

export function hideAppExitOverlay(): void {
  if (!state.visible) return;
  state = hidden;
  notifyListeners();
}

function getSnapshot(): AppExitOverlayState {
  return state;
}

function getServerSnapshot(): AppExitOverlayState {
  return serverSnapshot;
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

export function useAppExitOverlay(): AppExitOverlayState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Lets exit-on-close reuse the installed version from the update checker. */
let installedVersion = "";

export function setAppInstalledVersion(version: string): void {
  installedVersion = version.trim();
}

export function getAppInstalledVersion(): string {
  return installedVersion;
}
