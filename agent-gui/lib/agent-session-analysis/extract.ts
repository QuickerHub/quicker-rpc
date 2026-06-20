import type { AgentEvalRuntimeMetadata, AgentEvalToolCall } from "@/lib/agent-eval/types";
import type { SessionErrorClass, SessionMetrics, SessionToolCall } from "@/lib/agent-session-analysis/types";
import type { AgentTurnState } from "@/lib/agent-turn-state";
import type { ChatThreadExportPayload } from "@/lib/chat-thread-export";
import type { AgentUIMessage, TurnContextReport } from "@/lib/chat-types";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function classifyError(errorText: string): SessionErrorClass {
  if (/Expected object, received string|invalid_type|Type validation failed/i.test(errorText)) {
    return "schema";
  }
  if (/connect|ECONNREFUSED|pipe|qkrpc.*fail|timeout/i.test(errorText)) {
    return "connectivity";
  }
  if (/policy|denied|not allowed|confirmation/i.test(errorText)) {
    return "policy";
  }
  return "unknown";
}

function isToolPart(
  part: AgentUIMessage["parts"][number],
): part is AgentUIMessage["parts"][number] & {
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  toolCallId?: string;
} {
  return part.type.startsWith("tool-") && "state" in part;
}

function readToolName(partType: string): string {
  return partType.startsWith("tool-") ? partType.slice("tool-".length) : partType;
}

/** Tool calls with error metadata (superset of agent-eval trace). */
export function extractSessionToolCalls(messages: AgentUIMessage[]): SessionToolCall[] {
  const seen = new Set<string>();
  const calls: SessionToolCall[] = [];

  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (!isToolPart(part)) continue;
      const toolCallId =
        typeof part.toolCallId === "string"
          ? part.toolCallId
          : `${part.type}:${calls.length}`;
      if (seen.has(toolCallId)) continue;
      seen.add(toolCallId);

      const errorText =
        typeof part.errorText === "string" && part.errorText.trim()
          ? part.errorText.trim()
          : undefined;

      calls.push({
        toolName: readToolName(part.type),
        state: part.state,
        toolCallId,
        input: asRecord(part.input),
        output: asRecord(part.output),
        errorText,
        errorClass: errorText ? classifyError(errorText) : undefined,
      });
    }
  }

  return calls;
}

export function extractFirstUserPrompt(messages: AgentUIMessage[]): string {
  for (const message of messages) {
    if (message.role !== "user") continue;
    for (const part of message.parts) {
      if (part.type === "text" && typeof part.text === "string" && part.text.trim()) {
        return part.text.trim();
      }
    }
  }
  return extractLastUserPrompt(messages);
}

function extractLastUserPrompt(messages: AgentUIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role !== "user") continue;
    const parts: string[] = [];
    for (const part of message.parts) {
      if (part.type === "text" && typeof part.text === "string" && part.text.trim()) {
        parts.push(part.text);
      }
    }
    return parts.join("\n").trim();
  }
  return "";
}

export function extractRuntimeMetadataFromExport(
  messages: AgentUIMessage[],
): AgentEvalRuntimeMetadata[] {
  const rows: AgentEvalRuntimeMetadata[] = [];
  for (const message of messages) {
    if (message.role !== "assistant" || !message.metadata) continue;
    const meta = message.metadata;
    if (!meta.agentTurnState && !meta.recoveryDecision) continue;
    rows.push({
      feedbackCount: meta.recentToolFeedbackCount ?? 0,
      recoveryDecision: (meta.recoveryDecision ?? { kind: "none" }) as Record<
        string,
        unknown
      >,
      turnState: meta.agentTurnState
        ? (meta.agentTurnState as unknown as Record<string, unknown>)
        : null,
    });
  }
  return rows;
}

export function extractLatestContextReport(
  messages: AgentUIMessage[],
): TurnContextReport | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const report = messages[i]?.metadata?.contextReport;
    if (report) return report;
  }
  return undefined;
}

export function extractLatestAgentTurnState(
  messages: AgentUIMessage[],
): AgentTurnState | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const state = messages[i]?.metadata?.agentTurnState;
    if (state) return state;
  }
  return undefined;
}

export function toEvalToolTrace(calls: SessionToolCall[]): AgentEvalToolCall[] {
  return calls.map(({ toolName, state, input }) => ({ toolName, state, input }));
}

export function buildSessionMetrics(
  payload: ChatThreadExportPayload,
  toolCalls: SessionToolCall[],
  contextReport?: TurnContextReport,
): SessionMetrics {
  const usage = payload.stats.sessionUsage;
  const errorCount = toolCalls.filter((call) => call.state === "output-error").length;

  const toolRetryCount = countToolRetries(toolCalls);
  const staticContextTokens = contextReport?.categories
    ?.filter((category) => category.id === "system" || category.id === "tools")
    .reduce((sum, category) => sum + category.tokens, 0);

  return {
    toolCallCount: toolCalls.length,
    errorCount,
    retryCount: toolRetryCount,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    userTurnCount: payload.stats.userTurnCount,
    contextReport,
    staticContextTokens,
  };
}

function countToolRetries(toolCalls: SessionToolCall[]): number {
  let retries = 0;
  for (let i = 1; i < toolCalls.length; i += 1) {
    const prev = toolCalls[i - 1]!;
    const current = toolCalls[i]!;
    if (
      prev.toolName === current.toolName
      && prev.state === "output-error"
      && current.state !== "output-error"
    ) {
      retries += 1;
    }
  }
  return retries;
}
