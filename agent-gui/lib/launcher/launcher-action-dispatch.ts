"use client";

import type { ChatAddToolOutput } from "@/lib/chat-tool-actions";

export type LauncherSessionHandlers = {
  addToolOutput: ChatAddToolOutput;
  respondToAllPendingApprovals: (
    approved: boolean,
    options?: { deleteWorkspace?: boolean },
  ) => void;
};

const handlersBySession = new Map<string, LauncherSessionHandlers>();

export function registerLauncherSessionHandlers(
  sessionId: string,
  handlers: LauncherSessionHandlers,
): () => void {
  handlersBySession.set(sessionId, handlers);
  return () => {
    const current = handlersBySession.get(sessionId);
    if (current === handlers) {
      handlersBySession.delete(sessionId);
    }
  };
}

export function dispatchLauncherToolOutput(
  sessionId: string,
  payload: Parameters<ChatAddToolOutput>[0],
): boolean {
  const handlers = handlersBySession.get(sessionId);
  if (!handlers) return false;
  handlers.addToolOutput(payload);
  return true;
}

export function dispatchLauncherApprovalResponse(
  sessionId: string,
  approved: boolean,
  options?: { deleteWorkspace?: boolean },
): boolean {
  const handlers = handlersBySession.get(sessionId);
  if (!handlers) return false;
  handlers.respondToAllPendingApprovals(approved, options);
  return true;
}
