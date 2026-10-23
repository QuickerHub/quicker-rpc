"use client";

import { useEffect, useRef, useState } from "react";
import { createStreamValueThrottle } from "./stream-value-throttle";

/** Trailing throttle for streaming preview text (pairs with useChat experimental_throttle). */
export function useThrottledStreamValue(
  value: string,
  active: boolean,
  intervalMs = 120,
): string {
  const [rendered, setRendered] = useState(value);
  const throttleRef = useRef<ReturnType<typeof createStreamValueThrottle> | undefined>(undefined);

  // Cleanup on every chunk would debounce a continuous stream until it stops.
  useEffect(() => {
    const throttle = createStreamValueThrottle(setRendered, intervalMs);
    throttleRef.current = throttle;
    return () => {
      throttle.cancel();
      throttleRef.current = undefined;
    };
  }, [intervalMs]);

  useEffect(() => {
    if (active) throttleRef.current?.enqueue(value);
    else {
      throttleRef.current?.cancel();
      setRendered(value);
    }
  }, [value, active, intervalMs]);

  return active ? rendered : value;
}
