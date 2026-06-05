"use client";

import { useCallback, useSyncExternalStore } from "react";
import { isAgentGuiDebugMode } from "@/lib/agent-gui-debug";
import {
  RELEASE_PREVIEW_COOKIE,
  RELEASE_PREVIEW_STORAGE_KEY,
} from "@/lib/release-preview-constants";

const PREVIEW_CHANGE_EVENT = "qa-release-preview-change";

function readReleasePreviewClient(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (localStorage.getItem(RELEASE_PREVIEW_STORAGE_KEY) === "1") return true;
  } catch {
    /* ignore */
  }
  return document.documentElement.dataset.releasePreview === "1";
}

function writeReleasePreviewCookie(active: boolean) {
  const value = active ? "1" : "0";
  const maxAge = active ? "2592000" : "0";
  document.cookie = `${RELEASE_PREVIEW_COOKIE}=${value}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

function applyReleasePreviewDom(active: boolean) {
  if (active) {
    document.documentElement.dataset.releasePreview = "1";
  } else {
    delete document.documentElement.dataset.releasePreview;
  }
}

function notifyReleasePreviewChange() {
  window.dispatchEvent(new Event(PREVIEW_CHANGE_EVENT));
}

function subscribeReleasePreview(onStoreChange: () => void) {
  const onChange = () => onStoreChange();
  window.addEventListener(PREVIEW_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(PREVIEW_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useReleasePreviewActive(): boolean {
  return useSyncExternalStore(
    subscribeReleasePreview,
    readReleasePreviewClient,
    () => false,
  );
}

/** Dev-only UI (tool-test, dev LLM overlay, etc.) hidden in release preview. */
export function useDevExperienceEnabled(): boolean {
  const preview = useReleasePreviewActive();
  return isAgentGuiDebugMode() && !preview;
}

export function useReleasePreviewToggle() {
  const active = useReleasePreviewActive();

  const setActive = useCallback((next: boolean) => {
    if (!isAgentGuiDebugMode()) return;
    try {
      if (next) {
        localStorage.setItem(RELEASE_PREVIEW_STORAGE_KEY, "1");
      } else {
        localStorage.removeItem(RELEASE_PREVIEW_STORAGE_KEY);
      }
    } catch {
      /* ignore */
    }
    writeReleasePreviewCookie(next);
    applyReleasePreviewDom(next);
    notifyReleasePreviewChange();
    window.location.reload();
  }, []);

  const toggle = useCallback(() => {
    setActive(!active);
  }, [active, setActive]);

  return { active, toggle, setActive };
}
