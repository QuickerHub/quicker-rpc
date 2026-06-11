"use client";

import { useEffect } from "react";
import { prefetchTerminalStack } from "@/lib/terminal-session-client";

/** Background-warm terminal runtime + xterm chunks after app shell mounts. */
export function TerminalRuntimePrefetch() {
  useEffect(() => {
    prefetchTerminalStack();
  }, []);
  return null;
}
