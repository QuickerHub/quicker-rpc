import type { AgentEvalTraceRubric } from "@/lib/agent-eval/types";
import type { AuthoringBenchmarkTask } from "@/lib/authoring-benchmark";
import type { ChatThreadExportPayload } from "@/lib/chat-thread-export";
import type { AgentTurnState } from "@/lib/agent-turn-state";
import type { TurnContextReport } from "@/lib/chat-types";

export type SessionErrorClass =
  | "schema"
  | "connectivity"
  | "logic"
  | "policy"
  | "unknown";

export type SessionToolCall = {
  toolName: string;
  state: string;
  toolCallId?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  errorText?: string;
  errorClass?: SessionErrorClass;
};

export type SessionRuleFinding = {
  ruleId: string;
  severity: "info" | "warn" | "error";
  message: string;
  /** Repo path or doc hint for optimization. */
  optimizeHint?: string;
};

export type SessionMetrics = {
  toolCallCount: number;
  errorCount: number;
  retryCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  userTurnCount: number;
  contextReport?: TurnContextReport;
  staticContextTokens?: number;
};

export type SessionTrace = {
  userPrompt: string;
  toolCalls: SessionToolCall[];
  metrics: SessionMetrics;
  agentTurnState?: AgentTurnState;
  findings: SessionRuleFinding[];
  traceRubric: AgentEvalTraceRubric;
};

export type SessionOptimizationHint = {
  finding: SessionRuleFinding;
  targets: string[];
  suggestion: string;
};

export type SessionAnalysisResult = {
  export: ChatThreadExportPayload;
  matchedTask?: AuthoringBenchmarkTask;
  trace: SessionTrace;
  optimizationHints: SessionOptimizationHint[];
};
