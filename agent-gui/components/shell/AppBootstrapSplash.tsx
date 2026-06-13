"use client";

import { useLayoutEffect } from "react";
import { isActionDesignerEmbedClient } from "@/lib/action-designer-embed";
import { ensureChatStoreHydrated } from "@/lib/use-chat-store";

declare global {
  interface Window {
    __dismissAppBootstrapSplash?: () => void;
  }
}

function scheduleChatStoreHydration(): void {
  const hydrate = () => ensureChatStoreHydrated();
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(hydrate, { timeout: 2_500 });
  } else {
    window.setTimeout(hydrate, 0);
  }
}

/** Ask inline boot script to fade out the server-rendered splash (React hydration backup). */
export function AppBootstrapSplash() {
  useLayoutEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (window.location.pathname === "/launcher") {
      document.documentElement.dataset.appBootSkip = "1";
      window.__dismissAppBootstrapSplash?.();
      return;
    }

    if (isActionDesignerEmbedClient()) {
      document.documentElement.dataset.appBootSkip = "1";
      document.documentElement.classList.add("designer-embed-html");
      window.__dismissAppBootstrapSplash?.();
      ensureChatStoreHydrated();
      return;
    }

    window.__dismissAppBootstrapSplash?.();
    scheduleChatStoreHydration();
  }, []);

  return null;
}
