"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { messagesNeedsScroll } from "@/lib/use-messages-scrollable";

const TURN_STICKY_SLOP_PX = 8;
const STICKY_HYSTERESIS_PX = 24;

/** Sum direct children; ignores turn min-height from sticky-active. */
export function getTurnContentHeight(turn: HTMLElement): number {
  const styles = getComputedStyle(turn);
  const gap =
    parseFloat(styles.rowGap || "0")
    || parseFloat(styles.gap || "0")
    || 0;
  const children = Array.from(turn.children).filter(
    (node): node is HTMLElement => node instanceof HTMLElement,
  );
  if (children.length === 0) return 0;
  const heights = children.reduce((sum, child) => sum + child.offsetHeight, 0);
  return heights + gap * (children.length - 1);
}

/** Sticky prompt only when the thread scrolls and this turn is tall enough to scroll past it. */
export function shouldActivateMsgTurnSticky(
  messagesScrollHeight: number,
  messagesClientHeight: number,
  turnContentHeight: number,
  promptHeight: number,
  currentlyActive = false,
): boolean {
  if (!messagesNeedsScroll(messagesScrollHeight, messagesClientHeight)) {
    return false;
  }
  const threshold = messagesClientHeight - promptHeight + TURN_STICKY_SLOP_PX;
  if (currentlyActive) {
    return turnContentHeight > threshold - STICKY_HYSTERESIS_PX;
  }
  return turnContentHeight > threshold + STICKY_HYSTERESIS_PX;
}

/**
 * Enable fill-scrollport on the last turn when content is taller than the viewport.
 * Resizes are handled via ResizeObserver; pass a stable resetKey (e.g. threadId).
 */
export function useMsgTurnStickyActive(
  messagesRef: RefObject<HTMLElement | null>,
  turnRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  resetKey: string,
): boolean {
  const [active, setActive] = useState(false);
  const activeRef = useRef(false);

  useLayoutEffect(() => {
    activeRef.current = false;
    setActive(false);
  }, [resetKey]);

  useLayoutEffect(() => {
    if (!enabled) {
      if (activeRef.current) {
        activeRef.current = false;
        setActive(false);
      }
      return;
    }

    const messages = messagesRef.current;
    const turn = turnRef.current;
    if (!messages || !turn) return;

    let rafId = 0;

    const measure = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const promptEl = turn.querySelector<HTMLElement>(".msg-turn__prompt");
        const promptHeight = promptEl?.offsetHeight ?? 0;
        const next = shouldActivateMsgTurnSticky(
          messages.scrollHeight,
          messages.clientHeight,
          getTurnContentHeight(turn),
          promptHeight,
          activeRef.current,
        );
        if (next === activeRef.current) return;
        activeRef.current = next;
        setActive(next);
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(messages);
    observer.observe(turn);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [enabled, messagesRef, turnRef, resetKey]);

  return active;
}
