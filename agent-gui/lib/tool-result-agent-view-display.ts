import type { AgentViewMeta, AgentViewRefetch } from "@/lib/tool-result";
import { isStructuredToolResult } from "@/lib/tool-result";

function readRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function readAgentViewFromOutput(output: unknown): AgentViewMeta | null {
  if (!isStructuredToolResult(output)) return null;
  const view = output.agentView;
  if (!view || typeof view.agentSummary !== "string") return null;
  return view;
}

export function formatAgentViewRefetch(refetch: AgentViewRefetch): string {
  return `${refetch.tool} · ${refetch.reason} · ${JSON.stringify(refetch.inputPatch)}`;
}

/** One-line summary for tool popups and /tool-test result cards. */
export function formatAgentViewMetaLine(output: unknown): string | null {
  const view = readAgentViewFromOutput(output);
  if (!view) return null;

  const parts: string[] = [view.agentSummary];
  if (view.sizeEstimate) {
    parts.push(`~${view.sizeEstimate.tokens.toLocaleString()} tok`);
  }
  if (output && isStructuredToolResult(output) && output.displayData != null) {
    parts.push("UI 全量");
  }
  return parts.join(" · ");
}

export type AgentViewCompressStats = {
  agentSummary: string;
  modelChars: number;
  modelTokens: number;
  hasDisplayData: boolean;
  truncated: boolean;
  refetch?: AgentViewRefetch;
  anchors?: Record<string, string>;
};

export function formatAgentViewModelPayloadJson(output: unknown): string | null {
  if (!isStructuredToolResult(output)) {
    try {
      return JSON.stringify(output, null, 2);
    } catch {
      return null;
    }
  }

  const payload: Record<string, unknown> = {
    ok: output.ok,
    exitCode: output.exitCode,
    data: output.data,
    summary: output.summary,
    truncated: output.truncated,
    agentView: output.agentView,
    feedback: output.feedback,
  };
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return null;
  }
}

export function readAgentViewCompressStats(output: unknown): AgentViewCompressStats | null {
  if (!isStructuredToolResult(output)) return null;
  const view = readAgentViewFromOutput(output);
  if (!view) return null;

  const modelChars = JSON.stringify({
    ok: output.ok,
    data: output.data,
    summary: output.summary,
  }).length;

  return {
    agentSummary: view.agentSummary,
    modelChars: view.sizeEstimate?.chars ?? modelChars,
    modelTokens: view.sizeEstimate?.tokens ?? Math.ceil(modelChars / 4),
    hasDisplayData: output.displayData != null,
    truncated: output.truncated === true,
    refetch: view.refetch,
    anchors: view.anchors,
  };
}
