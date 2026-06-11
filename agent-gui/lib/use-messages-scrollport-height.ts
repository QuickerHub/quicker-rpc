"use client";

import { useLayoutEffect, type RefObject } from "react";

/** Keeps --messages-scrollport-height in sync so the active turn can fill the viewport for sticky. */
export function useMessagesScrollportHeight(
  scrollRootRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): void {
  useLayoutEffect(() => {
    if (!enabled) return;
    const root = scrollRootRef.current;
    if (!root) return;

    let lastHeight = -1;

    const sync = () => {
      const height = root.clientHeight;
      // Ignore scrollbar gutter flicker (~15–17px) that can loop with fill-scrollport min-height.
      if (lastHeight >= 0 && Math.abs(height - lastHeight) <= 1) {
        return;
      }
      lastHeight = height;
      root.style.setProperty(
        "--messages-scrollport-height",
        `${height}px`,
      );
    };

    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(root);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--messages-scrollport-height");
    };
  }, [scrollRootRef, enabled]);
}
