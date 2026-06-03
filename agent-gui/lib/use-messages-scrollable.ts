"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";

export const SCROLL_OVERFLOW_EPS_PX = 1;

export function messagesNeedsScroll(
  scrollHeight: number,
  clientHeight: number,
): boolean {
  return scrollHeight > clientHeight + SCROLL_OVERFLOW_EPS_PX;
}

export function useMessagesScrollable(
  messagesRef: RefObject<HTMLElement | null>,
  revision: unknown,
): boolean {
  const [scrollable, setScrollable] = useState(false);
  const scrollableRef = useRef(false);

  useLayoutEffect(() => {
    const messages = messagesRef.current;
    if (!messages) return;

    let rafId = 0;

    const measure = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const next = messagesNeedsScroll(
          messages.scrollHeight,
          messages.clientHeight,
        );
        if (next === scrollableRef.current) return;
        scrollableRef.current = next;
        setScrollable(next);
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(messages);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [messagesRef, revision]);

  return scrollable;
}
