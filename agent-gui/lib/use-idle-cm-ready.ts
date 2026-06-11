"use client";

import { useEffect, useState } from "react";

/** Defer CodeMirror mount until idle after `wantCm` becomes true. */
export function useIdleCmReady(wantCm: boolean, timeoutMs = 250): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!wantCm) {
      setReady(false);
      return;
    }

    setReady(false);
    let cancelled = false;

    const finish = () => {
      if (!cancelled) setReady(true);
    };

    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(finish, { timeout: timeoutMs });
      return () => {
        cancelled = true;
        cancelIdleCallback(id);
      };
    }

    const id = window.setTimeout(finish, 16);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [wantCm, timeoutMs]);

  return wantCm && ready;
}
