"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { ensureChatStoreHydrated } from "@/lib/use-chat-store";

const SPLASH_ID = "app-bootstrap-splash";
const MIN_VISIBLE_MS = 520;
const FADE_MS = 480;

function dismissSplashElement(el: HTMLElement): void {
  const started = performance.now();

  const beginFade = (): void => {
    const elapsed = performance.now() - started;
    const wait = Math.max(0, MIN_VISIBLE_MS - elapsed);
    window.setTimeout(() => {
      el.classList.add("app-bootstrap-splash--fade");
      document.documentElement.dataset.appReady = "1";
      window.setTimeout(() => {
        el.remove();
      }, FADE_MS);
    }, wait);
  };

  requestAnimationFrame(() => {
    requestAnimationFrame(beginFade);
  });
}

/** Dismisses the server-rendered boot splash once the client shell is interactive. */
export function AppBootstrapSplash() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/launcher") {
      document.documentElement.dataset.appBootSkip = "1";
      document.getElementById(SPLASH_ID)?.remove();
      return;
    }

    const el = document.getElementById(SPLASH_ID);
    if (!el) {
      document.documentElement.dataset.appReady = "1";
      return;
    }

    ensureChatStoreHydrated();
    dismissSplashElement(el);
  }, [pathname]);

  return null;
}
