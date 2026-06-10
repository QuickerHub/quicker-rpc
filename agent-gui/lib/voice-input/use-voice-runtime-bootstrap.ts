"use client";

import { useEffect, useRef } from "react";
import { isTauriShell } from "@/lib/tauri-shell";

/**
 * Tauri owns voice runtime auto-start on a delayed background thread.
 * React only emits one late refresh so controls reflect native startup state
 * without competing with first paint or window dragging.
 */
export function useVoiceRuntimeBootstrap(): void {
  const requestedRef = useRef(false);

  useEffect(() => {
    if (!isTauriShell()) return;
    if (requestedRef.current) return;
    requestedRef.current = true;

    const timer = window.setTimeout(() => {
      window.dispatchEvent(new Event("voice-input-config-changed"));
    }, 8_000);

    return () => window.clearTimeout(timer);
  }, []);
}
