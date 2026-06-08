"use client";

import {
  useCallback,
  useEffect,
  useRef,
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

/** Expand collapsed turn placeholders when they scroll into view. */
export function useAutoExpandColdTurns({
  containerRef,
  visible,
  revision,
  setExpandedColdTurns,
}: UseAutoExpandColdTurnsOptions): (node: HTMLDivElement | null) => void {
  const observerRef = useRef<IntersectionObserver | null>(null);

  const registerColdTurnNode = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    if (!node.matches(COLD_TURN_SELECTOR)) return;
    observerRef.current?.observe(node);
  }, []);

  useEffect(() => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!visible) return;
    const root = containerRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const turnIndices: number[] = [];
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const raw = (entry.target as HTMLElement).dataset.turnIndex;
          const turnIndex = raw == null ? Number.NaN : Number(raw);
          if (!Number.isFinite(turnIndex)) continue;
          turnIndices.push(turnIndex);
        }
        if (turnIndices.length === 0) return;
        setExpandedColdTurns((prev) => {
          const next = new Set(prev);
          let changed = false;
          for (const turnIndex of turnIndices) {
            if (next.has(turnIndex)) continue;
            next.add(turnIndex);
            changed = true;
          }
          return changed ? next : prev;
        });
      },
      { root, rootMargin: INTERSECT_ROOT_MARGIN, threshold: 0 },
    );
    observerRef.current = observer;

    root.querySelectorAll<HTMLDivElement>(COLD_TURN_SELECTOR).forEach((node) => {
      observer.observe(node);
    });

    return () => {
      observer.disconnect();
      if (observerRef.current === observer) {
        observerRef.current = null;
      }
    };
  }, [containerRef, revision, setExpandedColdTurns, visible]);

  return registerColdTurnNode;
}
