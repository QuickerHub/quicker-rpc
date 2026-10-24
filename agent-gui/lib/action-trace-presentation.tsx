"use client";
import { createContext, useContext, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { switchActionTraceThread } from "./action-trace-overlay";

export type ManualTracePresentationPort = Readonly<{
  threadId: string;
  cwd: string;
  projectDirectory?: string;
  isCurrent: () => boolean;
}>;
const ManualTracePresentationContext = createContext<ManualTracePresentationPort | undefined>(undefined);
/** Captures one visible presentation generation; it never supplies a native execution identity. */
export function ManualTracePresentationProvider({ threadId, cwd, active = true, projectDirectory, children }: {
  threadId?: string; cwd: string; active?: boolean; projectDirectory?: string; children: ReactNode;
}) {
  const current = useRef<ManualTracePresentationPort | undefined>(undefined);
  const port = useMemo<ManualTracePresentationPort | undefined>(() => {
    if (!active || !threadId || !cwd.trim()) return;
    const value: ManualTracePresentationPort = Object.freeze({ threadId, cwd: cwd.trim(), projectDirectory,
      isCurrent: () => current.current === value });
    return value;
  }, [threadId, cwd, active, projectDirectory]);
  useLayoutEffect(() => {
    current.current = port;
    if (port) switchActionTraceThread(port.threadId);
    return () => { if (current.current === port) current.current = undefined; };
  }, [port]);
  return <ManualTracePresentationContext.Provider value={port}>{children}</ManualTracePresentationContext.Provider>;
}
export const useManualTracePresentation = () => useContext(ManualTracePresentationContext);
