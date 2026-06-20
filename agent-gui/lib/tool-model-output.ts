import type { Tool, ToolResultOutput } from "ai";
import { buildModelFacingToolOutput } from "@/lib/tool-result-model-messages";

/** Map tool execute output to LLM tool-result JSON (strip UI-only displayData). */
export function toolOutputToModelJson(output: unknown): ToolResultOutput {
  const modelFacing = buildModelFacingToolOutput(output);
  return {
    type: "json",
    value: modelFacing === undefined ? null : modelFacing,
  };
}

/** Ensure streamText / generateText never send displayData to the model. */
export function withModelFacingToolOutput<T extends Tool>(toolDef: T): T {
  if (toolDef.toModelOutput) return toolDef;
  return {
    ...toolDef,
    toModelOutput: ({ output }) => toolOutputToModelJson(output),
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
