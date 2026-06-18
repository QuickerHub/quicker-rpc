/** Structured tool output (local docs or qkrpc). */

export type ToolNextAction = {
  tool: string;
  reason: string;
  input?: Record<string, unknown>;
  priority?: "required" | "recommended" | "optional";
};

export type ToolFeedback = {
  summary?: string;
  nextActions?: ToolNextAction[];
  retryable?: boolean;
  userDecisionRequired?: boolean;
};

export type AgentViewRefetch = {
  tool: string;
  reason: "pagination" | "detail_mode" | "full_trace" | "full_content";
  inputPatch: Record<string, unknown>;
};

export type AgentViewMeta = {
  agentSummary: string;
  anchors?: Record<string, string>;
  sizeEstimate?: { chars: number; tokens: number };
  refetch?: AgentViewRefetch;
};

export type StructuredToolResult = {
  ok: boolean;
  exitCode: number;
  source?: "local" | "qkrpc";
  /** Payload sent to the LLM (may be compressed). */
  data: unknown;
  /** Full payload for UI popups; stripped before convertToModelMessages. */
  displayData?: unknown;
  agentView?: AgentViewMeta;
  stderr?: string;
  truncated?: boolean;
} & ToolFeedback;

export function formatLocalToolResult(
  data: unknown,
  ok = true,
  error?: string,
  feedback?: ToolFeedback,
): StructuredToolResult {
  return {
    ok,
    exitCode: ok ? 0 : 1,
    source: "local",
    data,
    stderr: error,
    ...feedback,
  };
}

export function isStructuredToolResult(
  value: unknown,
): value is StructuredToolResult {
  if (typeof value !== "object" || value === null) return false;
  const o = value as Record<string, unknown>;
  return typeof o.ok === "boolean" && typeof o.exitCode === "number" && "data" in o;
}

/** Prefer displayData for UI rendering when agent view compression ran. */
export function resolveToolResultForDisplay(
  result: StructuredToolResult,
): StructuredToolResult {
  if (result.displayData === undefined) return result;
  return { ...result, data: result.displayData };
}

export function attachToolFeedback<T extends Record<string, unknown>>(
  result: T,
  feedback: ToolFeedback,
): T {
  if (!isStructuredToolResult(result)) return result;
  return {
    ...result,
    ...feedback,
    nextActions: [
      ...(result.nextActions ?? []),
      ...(feedback.nextActions ?? []),
    ],
  };
}
