"use client";

import { useSyncExternalStore } from "react";

export type AppUpdatePhase =
  | "hidden"
  | "checking"
  | "downloading"
  | "ready"
  | "applying"
  | "error";

export type AppUpdateOverlaySlice = {
  phase: AppUpdatePhase;
  installedVersion: string;
  remoteVersion: string | null;
  percent: number;
  message: string;
  error: string | null;
};

export type AppUpdateOverlayState = {
  app: AppUpdateOverlaySlice;
};

const hiddenApp: AppUpdateOverlaySlice = {
  phase: "hidden",
  installedVersion: "",
  remoteVersion: null,
  percent: 0,
  message: "",
  error: null,
};

let state: AppUpdateOverlayState = {
  app: hiddenApp,
};

const serverSnapshot: AppUpdateOverlayState = {
  app: hiddenApp,
};

const listeners = new Set<() => void>();

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function getAppUpdateOverlayState(): AppUpdateOverlayState {
  return state;
}

export function isAppUpdateOverlayVisible(): boolean {
  return state.app.phase !== "hidden";
}

export function patchAppUpdateOverlay(
  patch: Partial<AppUpdateOverlaySlice>,
): void {
  state = {
    ...state,
    app: { ...state.app, ...patch },
  };
  notifyListeners();
}

export function hideAppUpdateOverlaySlice(): void {
  if (state.app.phase === "hidden") return;
  state = { ...state, app: hiddenApp };
  notifyListeners();
}

export function showApplyingAppUpdateOverlay(
  installedVersion: string,
  remoteVersion: string | null,
): void {
  patchAppUpdateOverlay({
    phase: "applying",
    installedVersion,
    remoteVersion,
    percent: 0,
    message: "正在准备安装，随后将打开安装程序窗口…",
    error: null,
  });
}

export function dismissReadyAppUpdateOverlay(): void {
  if (state.app.phase !== "ready") return;
  hideAppUpdateOverlaySlice();
}

function getSnapshot(): AppUpdateOverlayState {
  return state;
}

function getServerSnapshot(): AppUpdateOverlayState {
  return serverSnapshot;
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

export function useAppUpdateOverlay(): AppUpdateOverlayState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
