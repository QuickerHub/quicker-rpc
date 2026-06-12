"use client";

import { useEffect } from "react";
import { prefetchTerminalStack } from "@/lib/terminal-session-client";

/** Warm terminal-runtime + xterm chunks as soon as the app shell mounts. */
export function useTerminalRuntimeBootstrap(): void {
  useEffect(() => {
    prefetchTerminalStack();
  }, []);
}
