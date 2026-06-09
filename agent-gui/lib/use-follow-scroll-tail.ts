import { useLayoutEffect, type RefObject } from "react";

/** Instant scroll to bottom when tailKey changes (no observers / rAF). */
export function useFollowScrollTail<T extends HTMLElement>(
  ref: RefObject<T | null>,
  enabled: boolean,
  tailKey: unknown,
): void {
  useLayoutEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [enabled, ref, tailKey]);
}
