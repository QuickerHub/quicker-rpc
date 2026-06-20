import type { AgentUIMessage } from "@/lib/chat-types";
import { isStructuredToolResult } from "@/lib/tool-result";

/** Tool result payload sent to the LLM (displayData stripped). Used by toModelOutput and history prep. */
export function buildModelFacingToolOutput(output: unknown): unknown {
  if (!isStructuredToolResult(output) || output.displayData === undefined) {
    return output;
  }
  const { displayData: _display, ...modelFacing } = output;
  return modelFacing;
}

function stripDisplayDataFromToolOutput(output: unknown): unknown {
  return buildModelFacingToolOutput(output);
}

/** Remove UI-only displayData before convertToModelMessages. */
export function stripToolDisplayDataFromMessages(
  messages: AgentUIMessage[],
): AgentUIMessage[] {
  let changed = false;
  const next = messages.map((message) => {
    let messageChanged = false;
    const parts = message.parts.map((part) => {
      if (!part.type.startsWith("tool-") || !("output" in part)) return part;
      if (part.state !== "output-available") return part;
      const stripped = stripDisplayDataFromToolOutput(part.output);
      if (stripped === part.output) return part;
      messageChanged = true;
      return { ...part, output: stripped };
    });
    if (!messageChanged) return message;
    changed = true;
    return { ...message, parts };
  });
  return changed ? next : messages;
}
