import type { JSONValue, Tool, ToolResultPart } from "ai";
import {
  buildModelFacingToolOutput,
  TOOL_OUTPUT_MAX_INLINE_CHARS,
} from "@/lib/tool-result-model-messages";

/** Map tool execute output to LLM tool-result JSON (strip UI-only displayData). */
export function toolOutputToModelJson(output: unknown): ToolResultPart["output"] {
  const modelFacing = buildModelFacingToolOutput(output);
  return {
    type: "json",
    value: (modelFacing === undefined ? null : modelFacing) as JSONValue,
  };
}

function boundExistingModelOutput(
  output: ToolResultPart["output"],
): ToolResultPart["output"] {
  if (output.type === "json") {
    return {
      type: "json",
      value: buildModelFacingToolOutput(output.value) as JSONValue,
    };
  }
  if (output.type !== "content") return output;

  const text = output.value
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
  if (text.length <= TOOL_OUTPUT_MAX_INLINE_CHARS) return output;

  const projected = buildModelFacingToolOutput({ content: text }) as {
    head?: string;
    tail?: string;
    originalChars?: number;
    notice?: string;
    kind?: string;
  };
  const replacement = JSON.stringify(projected);
  return {
    type: "content",
    value: [
      { type: "text", text: replacement },
      ...output.value.filter((part) => part.type !== "text"),
    ],
  };
}

/** Ensure streamText / generateText never send unbounded or UI-only payloads to the model. */
export function withModelFacingToolOutput<T extends Tool>(toolDef: T): T {
  const original = toolDef.toModelOutput;
  return {
    ...toolDef,
    toModelOutput: async (options) => {
      if (!original) return toolOutputToModelJson(options.output);
      return boundExistingModelOutput(await original(options));
    },
  };
}

export function applyModelFacingToolOutputToToolMap<T extends Record<string, Tool>>(
  tools: T,
): T {
  const next = {} as T;
  for (const key of Object.keys(tools) as Array<keyof T>) {
    next[key] = withModelFacingToolOutput(tools[key]) as T[keyof T];
  }
  return next;
}
