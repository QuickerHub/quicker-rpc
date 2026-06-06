"use client";

import { useEffect } from "react";
import { ensureChatStoreHydrated } from "@/lib/use-chat-store";

declare global {
  interface Window {
    __dismissAppBootstrapSplash?: () => void;
  }
}

/** Ask inline boot script to fade out the server-rendered splash (React hydration backup). */
export function AppBootstrapSplash() {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (window.location.pathname === "/launcher") {
      document.documentElement.dataset.appBootSkip = "1";
      window.__dismissAppBootstrapSplash?.();
      return;
    }

    ensureChatStoreHydrated();
    window.__dismissAppBootstrapSplash?.();
  }, []);

  return null;
}
