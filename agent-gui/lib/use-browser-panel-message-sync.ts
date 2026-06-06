"use client";

import {
  getToolOrDynamicToolName,
  isToolOrDynamicToolUIPart,
  type UIMessage,
} from "ai";
import { useEffect, useRef } from "react";
import { browserPanelPatchFromToolOutput } from "@/lib/browser-panel-sync";
import { useEmbeddedBrowserOptional } from "@/lib/embedded-browser-context";
import { BROWSER_TOOL } from "@/lib/browser-tool-constants";

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

/** Sync embedded browser panel from latest browser tool results in chat messages. */
export function useBrowserPanelMessageSync(messages: UIMessage[]): void {
  const embedded = useEmbeddedBrowserOptional();
  const primedRef = useRef(false);
  const prevCountRef = useRef(0);

  useEffect(() => {
    if (!embedded) return;

    const patch = findLatestBrowserPatch(messages);
    if (!patch) return;

    const prevCount = prevCountRef.current;
    const grew = messages.length > prevCount;
    prevCountRef.current = messages.length;

    // Replay chat history on cold start must not open the panel or mount WebView2.
    if (!primedRef.current) {
      primedRef.current = true;
      embedded.applySnapshot(patch);
      return;
    }

    if (!grew) return;

    embedded.applySnapshot(patch, { openPanel: true, navigate: true });
  }, [embedded, messages]);
}
