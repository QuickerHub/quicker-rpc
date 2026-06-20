import { isStructuredToolResult } from "@/lib/tool-result";
import { buildModelFacingToolOutput } from "@/lib/tool-result-model-messages";

export function estimateJsonChars(value: unknown): number {
  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
}

export function formatJsonSize(chars: number): string {
  if (chars <= 0) return "0 字符";
  if (chars < 1024) return `${chars} 字符`;
  return `${(chars / 1024).toFixed(1)}k 字符`;
}

export type ToolModelPayloadSlices = {
  kind: "structured" | "plain";
  input?: unknown;
  data?: unknown;
  displayData?: unknown;
  /** Payload serialized for the LLM (displayData stripped via toModelOutput). */
  modelOutput: unknown;
  agentSummary?: string;
  hasDisplayDataSlice: boolean;
  modelChars: number;
};

export function sliceToolModelPayload(
  input: unknown,
  output: unknown,
): ToolModelPayloadSlices | null {
  if (output === undefined) return null;

  const modelOutput = buildModelFacingToolOutput(output);
  const modelChars = estimateJsonChars(modelOutput);

  if (!isStructuredToolResult(output)) {
    return {
      kind: "plain",
      input,
      modelOutput,
      hasDisplayDataSlice: false,
      modelChars,
    };
  }

  const summary =
    typeof output.summary === "string" ? output.summary : undefined;

  return {
    kind: "structured",
    input,
    data: output.data,
    displayData: output.displayData,
    modelOutput,
    agentSummary: summary,
    hasDisplayDataSlice: output.displayData !== undefined,
    modelChars,
  };
}
