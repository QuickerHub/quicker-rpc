"use client";

import { useEffect, useRef, useState } from "react";

/** Trailing throttle for streaming preview text (pairs with useChat experimental_throttle). */
export function useThrottledStreamValue(
  value: string,
  active: boolean,
  intervalMs = 120,
): string {
  const [rendered, setRendered] = useState(value);
  const latestRef = useRef(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  latestRef.current = value;

  useEffect(() => {
    if (!active) {
      if (timerRef.current !== undefined) {
        clearTimeout(timerRef.current);
        timerRef.current = undefined;
      }
      setRendered(value);
      return;
    }

    if (timerRef.current !== undefined) return;

    timerRef.current = setTimeout(() => {
      timerRef.current = undefined;
      setRendered(latestRef.current);
    }, intervalMs);

    return () => {
      if (timerRef.current !== undefined) {
        clearTimeout(timerRef.current);
        timerRef.current = undefined;
      }
    };
  }, [value, active, intervalMs]);

  return active ? rendered : value;
}
