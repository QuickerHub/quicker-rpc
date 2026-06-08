"use client";

import {
  getToolOrDynamicToolName,
  isToolOrDynamicToolUIPart,
  type UIMessage,
} from "ai";
import { useEffect } from "react";
import {
  replaceActionProjectImports,
  type ActionProjectImportEntry,
} from "@/lib/action-project-import-state";
const IMPORT_TOOLS = new Set([
  "qkrpc_action_get",
  "qkrpc_subprogram_get",
  "workspace_action_read_data",
  "workspace_action_write_data",
  "workspace_action_edit_data",
]);

function isToolPartRunning(state: string): boolean {
  return state === "input-streaming" || state === "input-available";
}

function readActionIdFromToolInput(input: unknown): string | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const id = (input as Record<string, unknown>).id;
  return typeof id === "string" && id.trim() ? id.trim() : undefined;
}

function collectRunningImports(messages: UIMessage[]): ActionProjectImportEntry[] {
  const entries: ActionProjectImportEntry[] = [];
  const seen = new Set<string>();

  let startIndex = 0;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user") {
      startIndex = i;
      break;
    }
  }

  for (let i = startIndex; i < messages.length; i += 1) {
    const message = messages[i]!;
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (!isToolOrDynamicToolUIPart(part)) continue;
      const toolName = getToolOrDynamicToolName(part);
      if (!IMPORT_TOOLS.has(toolName)) continue;
      if (!isToolPartRunning(part.state)) continue;

      const actionId = readActionIdFromToolInput(part.input);
      if (!actionId) continue;
      const key = actionId.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({
        actionId,
        source:
          toolName === "qkrpc_action_get" || toolName === "qkrpc_subprogram_get"
            ? "tool"
            : "resolve",
      });
    }
  }

  return entries;
}

/** Mirror in-flight action get / workspace sync tools as explorer import spinners. */
export function useActionProjectImportFromMessages(
  messages: UIMessage[],
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return;
    replaceActionProjectImports(collectRunningImports(messages));
  }, [enabled, messages]);
}
