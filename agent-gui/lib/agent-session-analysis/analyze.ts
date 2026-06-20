import { evaluateTraceRubric } from "@/lib/agent-eval/trace-rubric";
import {
  buildSessionMetrics,
  extractFirstUserPrompt,
  extractLatestAgentTurnState,
  extractLatestContextReport,
  extractRuntimeMetadataFromExport,
  extractSessionToolCalls,
  toEvalToolTrace,
} from "@/lib/agent-session-analysis/extract";
import { matchAuthoringBenchmarkTask } from "@/lib/agent-session-analysis/match-task";
import {
  parseChatThreadExportJson,
  parseChatThreadExportText,
} from "@/lib/agent-session-analysis/parse-export";
import {
  buildOptimizationHints,
  formatSessionAnalysisJson,
  formatSessionAnalysisReport,
} from "@/lib/agent-session-analysis/report";
import { evaluateSessionRules } from "@/lib/agent-session-analysis/session-rules";
import type {
  SessionAnalysisResult,
  SessionTrace,
} from "@/lib/agent-session-analysis/types";
import type { ChatThreadExportPayload } from "@/lib/chat-thread-export";

export function analyzeChatThreadExport(
  payload: ChatThreadExportPayload,
): SessionAnalysisResult {
  const messages = payload.messages;
  const userPrompt = extractFirstUserPrompt(messages);
  const toolCalls = extractSessionToolCalls(messages);
  const contextReport = extractLatestContextReport(messages);
  const metrics = buildSessionMetrics(payload, toolCalls, contextReport);
  const sessionFindings = evaluateSessionRules(toolCalls, metrics);
  const runtimeMetadata = extractRuntimeMetadataFromExport(messages);
  const matchedTask = matchAuthoringBenchmarkTask(userPrompt);

  const traceRubric = evaluateTraceRubric(toEvalToolTrace(toolCalls), {
    taskId: matchedTask?.id,
    chatMode: "agent",
    readOnly: matchedTask?.readOnly,
    runtimeMetadata: runtimeMetadata.length > 0 ? runtimeMetadata : undefined,
    source: matchedTask ? "authoring" : undefined,
  });

  const trace: SessionTrace = {
    userPrompt,
    toolCalls,
    metrics,
    agentTurnState: extractLatestAgentTurnState(messages),
    findings: sessionFindings,
    traceRubric,
  };

  const optimizationHints = buildOptimizationHints(
    sessionFindings,
    traceRubric.violations,
  );

  return {
    export: payload,
    matchedTask,
    trace,
    optimizationHints,
  };
}

export function analyzeChatThreadExportJson(raw: unknown): SessionAnalysisResult {
  return analyzeChatThreadExport(parseChatThreadExportJson(raw));
}

export function analyzeChatThreadExportText(text: string): SessionAnalysisResult {
  return analyzeChatThreadExport(parseChatThreadExportText(text));
}

export {
  formatSessionAnalysisJson,
  formatSessionAnalysisReport,
  parseChatThreadExportJson,
  parseChatThreadExportText,
};

export type { SessionAnalysisResult, SessionTrace };
