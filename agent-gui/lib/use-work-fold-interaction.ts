"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
  type WheelEvent,
} from "react";
import {
  nextWorkFoldFollowing,
  resolveWorkFoldOpen,
  workFoldFollowingOnTailIntent,
  type WorkFoldOpenOverride,
  type WorkFoldScrollMetrics,
} from "./work-fold-interaction";

export function useWorkFoldOpen(defaultOpen: boolean) {
  const [openOverride, setOpenOverride] = useState<WorkFoldOpenOverride>(null);
  return {
    open: resolveWorkFoldOpen(defaultOpen, openOverride),
    setOpen: setOpenOverride,
  };
}

/** Each work pane owns its follow state; reading never changes the running turn. */
export function useWorkFoldFollow<T extends HTMLElement>(
  bodyRef: RefObject<T | null>,
  enabled: boolean,
  revision: unknown,
) {
  const followingRef = useRef(true);
  const lastMetricsRef = useRef<WorkFoldScrollMetrics | undefined>(undefined);
  const towardTailRef = useRef(false);

  const sampleMetrics = useCallback(() => {
    const body = bodyRef.current;
    if (!body) return undefined;
    return { scrollHeight: body.scrollHeight, scrollTop: body.scrollTop, clientHeight: body.clientHeight };
  }, [bodyRef]);

  const follow = useCallback(() => {
    const body = bodyRef.current;
    if (body && followingRef.current) body.scrollTop = body.scrollHeight;
    lastMetricsRef.current = sampleMetrics();
  }, [bodyRef, sampleMetrics]);

  useLayoutEffect(() => {
    if (!enabled) return;
    towardTailRef.current = false;
    follow();
    // Nested previews can finish their own layout after this parent effect.
    const frame = requestAnimationFrame(follow);
    return () => cancelAnimationFrame(frame);
  }, [enabled, revision, follow]);

  const onScroll = useCallback(() => {
    const metrics = sampleMetrics();
    if (metrics) {
      followingRef.current = nextWorkFoldFollowing(
        followingRef.current, metrics, lastMetricsRef.current, towardTailRef.current,
      );
      lastMetricsRef.current = metrics;
    }
    towardTailRef.current = false;
  }, [sampleMetrics]);

  const requestTailFollow = useCallback(() => {
    towardTailRef.current = true;
    const metrics = sampleMetrics();
    if (metrics) {
      followingRef.current = workFoldFollowingOnTailIntent(followingRef.current, metrics);
      lastMetricsRef.current = metrics;
    }
  }, [sampleMetrics]);

  const onWheelCapture = useCallback((event: WheelEvent<T>) => {
    if (event.deltaY > 0) requestTailFollow();
    else towardTailRef.current = false;
  }, [requestTailFollow]);

  const onPointerDownCapture = useCallback((event: PointerEvent<T>) => {
    if (event.target instanceof Element && event.target.closest("button")) {
      followingRef.current = false;
      towardTailRef.current = false;
    }
  }, []);

  const onKeyDownCapture = useCallback((event: KeyboardEvent<T>) => {
    if ((event.key === "Enter" || event.key === " ")
      && event.target instanceof Element && event.target.closest("button")) {
      followingRef.current = false;
      towardTailRef.current = false;
      return;
    }
    if (["ArrowDown", "PageDown", "End", " "].includes(event.key)) requestTailFollow();
    else towardTailRef.current = false;
  }, [requestTailFollow]);

  return { onScroll, onWheelCapture, onPointerDownCapture, onKeyDownCapture };
}
