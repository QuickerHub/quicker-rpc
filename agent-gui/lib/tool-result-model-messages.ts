import type { AgentUIMessage } from "@/lib/chat-types";
import { isStructuredToolResult } from "@/lib/tool-result";
import { projectStepRunnerKnowledge } from "./tool-knowledge-projection";

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
  const knowledgeProjection = projectStepRunnerKnowledge(output);
  let headChars = TOOL_OUTPUT_HEAD_CHARS;
  let tailChars = TOOL_OUTPUT_TAIL_CHARS;
  let feedbackChars = 512;
  const build = () => {
    const projection = {
      kind: "tool_output_projection",
      originalChars: serialized.length,
      head: serialized.slice(0, headChars),
      tail: tailChars ? serialized.slice(-tailChars) : "",
      ...(knowledgeProjection ? { knowledgeProjection } : {}),
      notice: knowledgeProjection
        ? "StepRunner schema was omitted for the model budget. The metadata projection is incomplete schema, not editing authority; an identical get will not recover it."
        : "Output was deterministically projected for model context. Use narrower parameters, paging, or a file read to inspect omitted content.",
    };

    if (!isStructuredToolResult(output)) return projection;

    return {
      ok: output.ok,
      exitCode: output.exitCode,
      source: typeof output.source === "string" ? output.source.slice(0, 128) : undefined,
      data: projection,
      stderr: typeof output.stderr === "string" ? output.stderr.slice(0, feedbackChars) : undefined,
      truncated: true,
      summary: typeof output.summary === "string" ? output.summary.slice(0, feedbackChars) : undefined,
      retryable: typeof output.retryable === "boolean" ? output.retryable : undefined,
      userDecisionRequired: typeof output.userDecisionRequired === "boolean" ? output.userDecisionRequired : undefined,
    };
  };
  let result = build();
  // Count the serialized projection, including JSON escaping and its metadata wrapper.
  while (JSON.stringify(result).length > TOOL_OUTPUT_MAX_INLINE_CHARS) {
    if (headChars || tailChars) {
      headChars = Math.floor(headChars / 2);
      tailChars = Math.floor(tailChars / 2);
    } else {
      feedbackChars = Math.floor(feedbackChars / 2);
    }
    result = build();
  }
  return result;
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
