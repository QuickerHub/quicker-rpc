"use client";

import {
  getToolOrDynamicToolName,
  isToolOrDynamicToolUIPart,
} from "ai";
import { useEffect, useMemo, useRef } from "react";
import type { AgentUIMessage } from "@/lib/chat-types";
import { parseActionIdFromSyncedToolOutput } from "@/lib/action-projects";
import { queueRevealActionProjectById } from "@/lib/workspace-explorer";
import {
  markWorkspaceToolAutoOpened,
  readToolCallId,
} from "@/lib/workspace-tool-auto-open";
import { shouldRunToolTerminalEffect } from "@/lib/use-tool-terminal-effect";

function buildToolStateSignature(messages: AgentUIMessage[]): string {
  const parts: string[] = [];
  for (const message of messages) {
    for (const part of message.parts) {
      if (!isToolOrDynamicToolUIPart(part)) continue;
      const toolCallId = readToolCallId(part);
      const key =
        toolCallId?.trim()
        || `msg:${message.id}:${getToolOrDynamicToolName(part)}`;
      const state = "state" in part ? part.state : "unknown";
      parts.push(`${key}\0${state}`);
    }
  }
  return parts.join("\n");
}

/**
 * After `qkrpc_action_create` completes, queue reveal in the explorer.
 * Tree updates come from `/api/workspace/watch` (filesystem watch), not manual refresh.
 */
export function useSyncExplorerOnToolMessages(
  threadId: string,
  messages: AgentUIMessage[],
): void {
  const prevStateByCallIdRef = useRef<Map<string, string>>(new Map());

  const toolStateSignature = useMemo(
    () => buildToolStateSignature(messages),
    [messages],
  );

  useEffect(() => {
    prevStateByCallIdRef.current.clear();
  }, [threadId]);

  useEffect(() => {
    for (const message of messages) {
      for (const part of message.parts) {
        if (!isToolOrDynamicToolUIPart(part)) continue;

        const toolCallId = readToolCallId(part);
        const key =
          toolCallId?.trim()
          || `msg:${message.id}:${getToolOrDynamicToolName(part)}`;
        const name = getToolOrDynamicToolName(part);
        const state = "state" in part ? part.state : "unknown";

        const prev = prevStateByCallIdRef.current.get(key);
        if (prev === undefined) {
          prevStateByCallIdRef.current.set(key, state);
          continue;
        }
        prevStateByCallIdRef.current.set(key, state);
        if (!shouldRunToolTerminalEffect(prev, state, "output-available")) {
          continue;
        }

        if (name !== "qkrpc_action_create") continue;

        const dedupeKey = `explorer-reveal:${key}`;
        if (!markWorkspaceToolAutoOpened(dedupeKey)) continue;

        const output = "output" in part ? part.output : undefined;
        const actionId = parseActionIdFromSyncedToolOutput(output);
        if (actionId) queueRevealActionProjectById(actionId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- messages
  }, [toolStateSignature]);
}
