"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_EMBEDDED_BROWSER_ID,
  embeddedBrowserTauriAvailable,
  fetchEmbeddedBrowserNavigationState,
  type EmbeddedBrowserNavigationState,
} from "@/lib/embedded-browser-tauri";

const POLL_MS = 600;

/** Poll WebView2 navigation state (native history + current URL/title). */
export function useEmbeddedBrowserNavigationState(
  enabled: boolean,
  browserId: string = DEFAULT_EMBEDDED_BROWSER_ID,
) {
  const [state, setState] = useState<EmbeddedBrowserNavigationState | null>(
    null,
  );

  useEffect(() => {
    if (!enabled || !embeddedBrowserTauriAvailable()) {
      setState(null);
      return;
    }

    let cancelled = false;

    const poll = async () => {
      try {
        const next = await fetchEmbeddedBrowserNavigationState(browserId);
        if (!cancelled) setState(next);
      } catch {
        if (!cancelled) setState(null);
      }
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [browserId, enabled]);

  return state;
}
