"use client";

import {
  useEffect,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";

type UseAutoExpandColdTurnsOptions = {
  containerRef: RefObject<HTMLElement | null>;
  visible: boolean;
  /** Re-run observers when the mounted turn window or messages change. */
  revision: unknown;
  setExpandedColdTurns: Dispatch<SetStateAction<Set<number>>>;
};

const COLD_TURN_SELECTOR = ".msg-turn--cold[data-turn-index]";
const INTERSECT_ROOT_MARGIN = "120px 0px 240px 0px";

function mergeTurnIndex(
  setExpandedColdTurns: Dispatch<SetStateAction<Set<number>>>,
  turnIndex: number,
) {
  setExpandedColdTurns((prev) => {
    if (prev.has(turnIndex)) return prev;
    const next = new Set(prev);
    next.add(turnIndex);
    return next;
  });
}

/** Expand collapsed turn placeholders when they scroll into view. */
export function useAutoExpandColdTurns({
  containerRef,
  visible,
  revision,
  setExpandedColdTurns,
}: UseAutoExpandColdTurnsOptions) {
  useEffect(() => {
    if (!visible) return;
    const root = containerRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const raw = (entry.target as HTMLElement).dataset.turnIndex;
          const turnIndex = raw == null ? Number.NaN : Number(raw);
          if (!Number.isFinite(turnIndex)) continue;
          mergeTurnIndex(setExpandedColdTurns, turnIndex);
        }
      },
      { root, rootMargin: INTERSECT_ROOT_MARGIN, threshold: 0 },
    );

    const observeColdTurns = () => {
      observer.disconnect();
      root.querySelectorAll<HTMLElement>(COLD_TURN_SELECTOR).forEach((node) => {
        observer.observe(node);
      });
    };

    observeColdTurns();

    const mutationObserver = new MutationObserver(() => {
      observeColdTurns();
    });
    mutationObserver.observe(root, { childList: true, subtree: true });

    return () => {
      mutationObserver.disconnect();
      observer.disconnect();
    };
  }, [containerRef, revision, setExpandedColdTurns, visible]);
}
