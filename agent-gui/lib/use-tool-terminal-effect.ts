import { useEffect, useRef } from "react";
import { markWorkspaceToolAutoOpened } from "@/lib/workspace-tool-auto-open";

/** True only on a real state transition into `terminalState`, not on initial mount. */
export function shouldRunToolTerminalEffect(
  prev: string | null,
  state: string,
  terminalState: string,
): boolean {
  if (prev === null) return false;
  return state === terminalState && prev !== terminalState;
}

/** Run once when `state` transitions into `terminalState` (avoids output identity loops). */
export function useOnToolStateEntered(
  state: string,
  terminalState: string,
  run: () => void,
  options?: { dedupeKey?: string },
): void {
  const prevStateRef = useRef<string | null>(null);
  const runRef = useRef(run);
  runRef.current = run;
  const dedupeKey = options?.dedupeKey?.trim() || undefined;

  useEffect(() => {
    const prev = prevStateRef.current;
    if (prev === null) {
      prevStateRef.current = state;
      return;
    }
    prevStateRef.current = state;
    if (!shouldRunToolTerminalEffect(prev, state, terminalState)) return;
    if (dedupeKey && !markWorkspaceToolAutoOpened(dedupeKey)) return;
    runRef.current();
  }, [state, terminalState, dedupeKey]);
}
