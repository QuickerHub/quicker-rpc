"use client";

import {
  getToolOrDynamicToolName,
  isToolOrDynamicToolUIPart,
  type UIMessage,
} from "ai";
import { useEffect } from "react";
import { browserPanelPatchFromToolOutput } from "@/lib/browser-panel-sync";
import { useEmbeddedBrowserOptional } from "@/lib/embedded-browser-context";
import { BROWSER_TOOL } from "@/lib/browser-tool-constants";

/** Sync embedded browser panel from latest browser tool results in chat messages. */
export function useBrowserPanelMessageSync(messages: UIMessage[]): void {
  const embedded = useEmbeddedBrowserOptional();

  useEffect(() => {
    if (!embedded) return;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      if (message.role !== "assistant") continue;
      for (let j = message.parts.length - 1; j >= 0; j -= 1) {
        const part = message.parts[j];
        if (!isToolOrDynamicToolUIPart(part)) continue;
        if (getToolOrDynamicToolName(part) !== BROWSER_TOOL) continue;
        if (part.state !== "output-available") continue;
        const patch = browserPanelPatchFromToolOutput(part.output);
        if (patch) {
          embedded.applySnapshot(patch);
          return;
        }
      }
    }
  }, [embedded, messages]);
}
