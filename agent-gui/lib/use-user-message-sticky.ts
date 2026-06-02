"use client";

import { useEffect, type RefObject } from "react";

const STUCK_CLASS = "msg-content--stuck";
const SCROLL_TOP_MIN = 4;

/** Toggle stuck styling on in-flow user bubbles (native `position: sticky`). */
export function useUserMessageStickyMarkers(
  scrollRootRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  /** Re-run when the thread messages change. */
  messagesRevision: unknown,
): void {
  useEffect(() => {
    if (!enabled) return;
    const root = scrollRootRef.current;
    if (!root) return;
    const view = root.closest<HTMLElement>(".messages-view");
    if (!view) return;

    let raf = 0;

    const update = () => {
      const raw = getComputedStyle(view)
        .getPropertyValue("--messages-sticky-top-gap")
        .trim();
      const gap = raw ? parseFloat(raw) : 8;
      const slotTop = view.getBoundingClientRect().top + gap;
      const canStick = root.scrollTop > SCROLL_TOP_MIN;

      root.querySelectorAll<HTMLElement>(".msg--user .msg-content").forEach((el) => {
        if (!canStick) {
          el.classList.remove(STUCK_CLASS);
          return;
        }
        const top = el.getBoundingClientRect().top;
        el.classList.toggle(STUCK_CLASS, top <= slotTop + 1);
      });
    };

    const schedule = () => {
      if (raf !== 0) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        update();
      });
    };

    root.addEventListener("scroll", schedule, { passive: true });
    const resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(root);
    update();

    return () => {
      root.removeEventListener("scroll", schedule);
      resizeObserver.disconnect();
      if (raf !== 0) cancelAnimationFrame(raf);
      root.querySelectorAll<HTMLElement>(".msg--user .msg-content").forEach((el) => {
        el.classList.remove(STUCK_CLASS);
      });
    };
  }, [enabled, messagesRevision, scrollRootRef]);
}
