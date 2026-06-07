"use client";

import type { AgentUIMessage } from "@/lib/chat-types";

export const LAUNCHER_CHANNEL = "quicker-agent-launcher-v1";

export type LauncherSubmitMessage = {
  type: "composer:submit";
  text: string;
  sessionId: string;
  llmSelection?: string;
};

export type LauncherSessionSyncMessage = {
  type: "agent:session-sync";
  sessionId: string;
  threadId: string;
  messages: AgentUIMessage[];
  status: string;
  error: string | null;
  pendingApprovalCount: number;
  pendingAskQuestionCount?: number;
};

export type LauncherSessionClearMessage = {
  type: "launcher:session-clear";
};

export type LauncherOpenedMessage = {
  type: "launcher:opened";
};

export type LauncherBridgeMessage =
  | LauncherSubmitMessage
  | LauncherSessionSyncMessage
  | LauncherSessionClearMessage
  | LauncherOpenedMessage;

export function createLauncherSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `launcher-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function postLauncherMessage(message: LauncherBridgeMessage): void {
  if (typeof window === "undefined") return;
  const channel = new BroadcastChannel(LAUNCHER_CHANNEL);
  channel.postMessage(message);
  channel.close();
}

export function postLauncherSubmit(
  text: string,
  sessionId: string,
  llmSelection?: string,
): void {
  postLauncherMessage({
    type: "composer:submit",
    text,
    sessionId,
    llmSelection: llmSelection?.trim() || undefined,
  });
}

export function postLauncherSessionSync(payload: {
  sessionId: string;
  threadId: string;
  messages: AgentUIMessage[];
  status: string;
  error: string | null;
  pendingApprovalCount: number;
  pendingAskQuestionCount?: number;
}): void {
  postLauncherMessage({
    type: "agent:session-sync",
    ...payload,
  });
}

export function postLauncherSessionClear(): void {
  postLauncherMessage({ type: "launcher:session-clear" });
}

export function postLauncherOpened(): void {
  postLauncherMessage({ type: "launcher:opened" });
}

export function subscribeLauncherBridge(
  handler: (message: LauncherBridgeMessage) => void,
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  const channel = new BroadcastChannel(LAUNCHER_CHANNEL);
  channel.onmessage = (event: MessageEvent<unknown>) => {
    const data = event.data;
    if (!data || typeof data !== "object" || !("type" in data)) return;

    if (data.type === "composer:submit") {
      const payload = data as LauncherSubmitMessage;
      if (
        typeof payload.text !== "string"
        || !payload.text.trim()
        || typeof payload.sessionId !== "string"
      ) {
        return;
      }
      handler({
        type: "composer:submit",
        text: payload.text.trim(),
        sessionId: payload.sessionId,
        llmSelection:
          typeof payload.llmSelection === "string"
            ? payload.llmSelection.trim()
            : undefined,
      });
      return;
    }

    if (data.type === "agent:session-sync") {
      const payload = data as LauncherSessionSyncMessage;
      if (
        typeof payload.sessionId !== "string"
        || typeof payload.threadId !== "string"
        || !Array.isArray(payload.messages)
        || typeof payload.status !== "string"
      ) {
        return;
      }
      handler({
        type: "agent:session-sync",
        sessionId: payload.sessionId,
        threadId: payload.threadId,
        messages: payload.messages,
        status: payload.status,
        error:
          typeof payload.error === "string" ? payload.error : payload.error ?? null,
        pendingApprovalCount:
          typeof payload.pendingApprovalCount === "number"
            ? payload.pendingApprovalCount
            : 0,
        pendingAskQuestionCount:
          typeof payload.pendingAskQuestionCount === "number"
            ? payload.pendingAskQuestionCount
            : 0,
      });
      return;
    }

    if (data.type === "launcher:session-clear") {
      handler({ type: "launcher:session-clear" });
      return;
    }

    if (data.type === "launcher:opened") {
      handler({ type: "launcher:opened" });
    }
  };
  return () => channel.close();
}
