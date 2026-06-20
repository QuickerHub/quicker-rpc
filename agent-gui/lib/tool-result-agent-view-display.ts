import type { ToolNextAction } from "@/lib/tool-result";
import { isStructuredToolResult } from "@/lib/tool-result";
import { buildModelFacingToolOutput } from "@/lib/tool-result-model-messages";

function readRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function formatToolNextAction(action: ToolNextAction): string {
  const input = action.input ? JSON.stringify(action.input) : "";
  return `${action.tool} · ${action.reason}${input ? ` · ${input}` : ""}`;
}

/** One-line summary for tool popups and /tool-test result cards. */
export function formatToolResultSummaryLine(output: unknown): string | null {
  if (!isStructuredToolResult(output)) return null;
  const parts: string[] = [];
  if (typeof output.summary === "string" && output.summary.trim()) {
    parts.push(output.summary.trim());
  }
  const modelChars = JSON.stringify(buildModelFacingToolOutput(output)).length;
  parts.push(`~${Math.ceil(modelChars / 4).toLocaleString()} tok`);
  if (output.displayData != null) {
    parts.push("UI 全量");
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

export type ToolCompressStats = {
  summary: string;
  modelChars: number;
  modelTokens: number;
  hasDisplayData: boolean;
  truncated: boolean;
  nextActions?: ToolNextAction[];
};

export function formatToolModelPayloadJson(output: unknown): string | null {
  const modelFacing = buildModelFacingToolOutput(output);
  try {
    return JSON.stringify(modelFacing, null, 2);
  } catch {
    return null;
  }
}

export function toolOutputHasStrippedDisplayData(output: unknown): boolean {
  return isStructuredToolResult(output) && output.displayData !== undefined;
}

export function readToolCompressStats(output: unknown): ToolCompressStats | null {
  if (!isStructuredToolResult(output)) return null;
  const hasMeta =
    typeof output.summary === "string"
    || output.truncated === true
    || output.displayData != null
    || (output.nextActions?.length ?? 0) > 0;
  if (!hasMeta) return null;

  const modelChars = JSON.stringify(buildModelFacingToolOutput(output)).length;

  return {
    summary:
      typeof output.summary === "string" && output.summary.trim()
        ? output.summary.trim()
        : output.ok ? "ok" : "failed",
    modelChars,
    modelTokens: Math.ceil(modelChars / 4),
    hasDisplayData: output.displayData != null,
    truncated: output.truncated === true,
    nextActions: output.nextActions,
  };
}
