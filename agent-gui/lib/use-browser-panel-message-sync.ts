"use client";

import {
  getToolOrDynamicToolName,
  isToolOrDynamicToolUIPart,
  type UIMessage,
} from "ai";
import { useEffect, useMemo, useRef } from "react";
import {
  browserPanelPatchFromToolOutput,
  browserPanelSyncFromToolOutput,
} from "@/lib/browser-panel-sync";
import { BROWSER_TOOL } from "@/lib/browser-tool-constants";
import { useEmbeddedBrowserOptional } from "@/lib/embedded-browser-context";
import { shouldRunToolTerminalEffect } from "@/lib/use-tool-terminal-effect";
import { readToolCallId } from "@/lib/workspace-tool-auto-open";

function findLatestBrowserPatch(
  messages: UIMessage[],
): ReturnType<typeof browserPanelPatchFromToolOutput> {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== "assistant") continue;
    for (let j = message.parts.length - 1; j >= 0; j -= 1) {
      const part = message.parts[j];
      if (!isToolOrDynamicToolUIPart(part)) continue;
      if (getToolOrDynamicToolName(part) !== BROWSER_TOOL) continue;
      if (part.state !== "output-available") continue;
      const patch = browserPanelPatchFromToolOutput(part.output);
      if (patch) return patch;
    }
  }
  return null;
}

function seedBrowserToolStates(
  messages: UIMessage[],
  stateByCallId: Map<string, string>,
): void {
  for (const message of messages) {
    for (const part of message.parts) {
      if (!isToolOrDynamicToolUIPart(part)) continue;
      if (getToolOrDynamicToolName(part) !== BROWSER_TOOL) continue;
      const key =
        readToolCallId(part)?.trim()
        || `msg:${message.id}:${BROWSER_TOOL}`;
      const state = "state" in part ? part.state : "unknown";
      stateByCallId.set(key, state);
    }
  }
}

function buildBrowserToolStateSignature(messages: UIMessage[]): string {
  const parts: string[] = [];
  for (const message of messages) {
    for (const part of message.parts) {
      if (!isToolOrDynamicToolUIPart(part)) continue;
      if (getToolOrDynamicToolName(part) !== BROWSER_TOOL) continue;
      const key =
        readToolCallId(part)?.trim()
        || `msg:${message.id}:${BROWSER_TOOL}`;
      const state = "state" in part ? part.state : "unknown";
      parts.push(`${key}\0${state}`);
    }
  }
  return parts.join("\n");
}

/** Sync embedded browser panel from latest browser tool results in chat messages. */
export function useBrowserPanelMessageSync(
  messages: UIMessage[],
  options?: { enabled?: boolean },
): void {
  const embedded = useEmbeddedBrowserOptional();
  const primedRef = useRef(false);
  const prevStateByCallIdRef = useRef<Map<string, string>>(new Map());
  const enabled = options?.enabled !== false;

  const browserToolStateSignature = useMemo(
    () => buildBrowserToolStateSignature(messages),
    [messages],
  );

  useEffect(() => {
    if (!enabled || !embedded) return;

    if (!primedRef.current) {
      primedRef.current = true;
      const patch = findLatestBrowserPatch(messages);
      if (patch) {
        embedded.applySnapshot(patch);
      }
      seedBrowserToolStates(messages, prevStateByCallIdRef.current);
      return;
    }

    for (const message of messages) {
      for (const part of message.parts) {
        if (!isToolOrDynamicToolUIPart(part)) continue;
        if (getToolOrDynamicToolName(part) !== BROWSER_TOOL) continue;

        const key =
          readToolCallId(part)?.trim()
          || `msg:${message.id}:${BROWSER_TOOL}`;
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

        const output = "output" in part ? part.output : undefined;
        const intent = browserPanelSyncFromToolOutput(output);
        if (!intent) continue;

        embedded.applySnapshot(intent.patch, {
          openPanel: intent.openPanel,
          navigate: intent.navigate,
        });
      }
    }
  }, [browserToolStateSignature, embedded, enabled, messages]);
}
