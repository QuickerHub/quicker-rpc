"use client";

import { useSyncExternalStore } from "react";

export type AppUpdatePhase =
  | "hidden"
  | "checking"
  | "downloading"
  | "ready"
  | "applying"
  | "error";

export type VoiceUpdatePhase = "hidden" | "downloading" | "ready";

export type AppUpdateOverlaySlice = {
  phase: AppUpdatePhase;
  installedVersion: string;
  remoteVersion: string | null;
  percent: number;
  message: string;
  error: string | null;
};

export type VoiceUpdateOverlaySlice = {
  phase: VoiceUpdatePhase;
  percent: number;
  message: string;
};

export type AppUpdateOverlayState = {
  app: AppUpdateOverlaySlice;
  voice: VoiceUpdateOverlaySlice;
};

const hiddenApp: AppUpdateOverlaySlice = {
  phase: "hidden",
  installedVersion: "",
  remoteVersion: null,
  percent: 0,
  message: "",
  error: null,
};

const hiddenVoice: VoiceUpdateOverlaySlice = {
  phase: "hidden",
  percent: 0,
  message: "",
};

let state: AppUpdateOverlayState = {
  app: hiddenApp,
  voice: hiddenVoice,
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
  return state.app.phase !== "hidden" || state.voice.phase !== "hidden";
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

export function patchVoiceUpdateOverlay(
  patch: Partial<VoiceUpdateOverlaySlice>,
): void {
  state = {
    ...state,
    voice: { ...state.voice, ...patch },
  };
  notifyListeners();
}

export function hideAppUpdateOverlaySlice(): void {
  if (state.app.phase === "hidden") return;
  state = { ...state, app: hiddenApp };
  notifyListeners();
}

export function hideVoiceUpdateOverlaySlice(): void {
  if (state.voice.phase === "hidden") return;
  state = { ...state, voice: hiddenVoice };
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
    message: "正在启动安装程序…",
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
  return {
    app: hiddenApp,
    voice: hiddenVoice,
  };
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

export function useAppUpdateOverlay(): AppUpdateOverlayState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
