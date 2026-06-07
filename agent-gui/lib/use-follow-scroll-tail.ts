import { useLayoutEffect, type RefObject } from "react";

/** Instant scroll to bottom when deps change (no observers / rAF). */
export function useFollowScrollTail<T extends HTMLElement>(
  ref: RefObject<T | null>,
  enabled: boolean,
  ...deps: unknown[]
): void {
  useLayoutEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are caller-driven tail keys
  }, [enabled, ref, ...deps]);
}
