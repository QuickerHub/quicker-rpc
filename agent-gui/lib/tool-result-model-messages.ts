import type { AgentUIMessage } from "@/lib/chat-types";
import { isStructuredToolResult } from "@/lib/tool-result";

export const TOOL_OUTPUT_MAX_INLINE_CHARS = 8 * 1024;
const TOOL_OUTPUT_HEAD_CHARS = 6 * 1024;
const TOOL_OUTPUT_TAIL_CHARS = 1024;

function serializeForBudget(value: unknown): string | null {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function projectLargeOutput(output: unknown, serialized: string): unknown {
  const projection = {
    kind: "tool_output_projection",
    originalChars: serialized.length,
    head: serialized.slice(0, TOOL_OUTPUT_HEAD_CHARS),
    tail: serialized.slice(-TOOL_OUTPUT_TAIL_CHARS),
    notice:
      "Output was deterministically projected for model context. Use narrower parameters, paging, or a file read to inspect omitted content.",
  };

  if (!isStructuredToolResult(output)) {
    return projection;
  }

  return {
    ok: output.ok,
    exitCode: output.exitCode,
    source: output.source,
    data: projection,
    stderr: output.stderr?.slice(0, 512),
    truncated: true,
    summary: output.summary?.slice(0, 512),
    retryable: output.retryable,
    userDecisionRequired: output.userDecisionRequired,
  };
}

/** Tool result payload sent to the LLM: strip UI data, then enforce a stable context budget. */
export function buildModelFacingToolOutput(output: unknown): unknown {
  let modelFacing = output;
  if (isStructuredToolResult(output) && output.displayData !== undefined) {
    const { displayData: _display, ...stripped } = output;
    modelFacing = stripped;
  }

  const serialized = serializeForBudget(modelFacing);
  if (serialized === null || serialized.length <= TOOL_OUTPUT_MAX_INLINE_CHARS) {
    return modelFacing;
  }
  return projectLargeOutput(modelFacing, serialized);
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
