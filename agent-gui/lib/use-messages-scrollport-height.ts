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

    const sync = () => {
      root.style.setProperty(
        "--messages-scrollport-height",
        `${root.clientHeight}px`,
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
