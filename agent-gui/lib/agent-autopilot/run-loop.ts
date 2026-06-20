import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  analyzeChatThreadExport,
  formatSessionAnalysisJson,
  formatSessionAnalysisReport,
} from "@/lib/agent-session-analysis";
import type { SessionAnalysisResult } from "@/lib/agent-session-analysis";
import { extractRuntimeMetadataFromExport } from "@/lib/agent-session-analysis/extract";
import {
  buildChatThreadExportPayload,
  buildChatThreadExportFilename,
  serializeChatThreadExport,
} from "@/lib/chat-thread-export";
import type { ChatThread } from "@/lib/chat-store";
import type { AgentUIMessage } from "@/lib/chat-types";
import {
  defaultAgentGuiBaseUrl,
  postAgentGuiChat,
} from "@/lib/agent-eval/chat-client";
import { formatAgentEvalChatError } from "@/lib/agent-eval/eval-chat-error";
import {
  loadEvalScenario,
  resolveScenarioWorkingDirectory,
  type AgentEvalScenario,
} from "@/lib/agent-eval/eval-scenario";
import { extractToolTrace } from "@/lib/agent-eval/trace-extract";
import { evaluateTraceExpect } from "@/lib/agent-eval/trace-expect";
import { evaluateTraceRubric } from "@/lib/agent-eval/trace-rubric";
import { resolveWorkingEvalLlmSelection } from "@/lib/agent-autopilot/resolve-llm";
import { applySessionOptimizationHints } from "@/lib/agent-autopilot/apply-hints";

export type AgentAutopilotRunOptions = {
  baseUrl?: string;
  llmSelection?: string;
  outDir?: string;
  applyHints?: boolean;
  skipProbe?: boolean;
};

export type AgentAutopilotRunResult = {
  scenarioId: string;
  llmSelection: string;
  chatOk: boolean;
  chatError?: string;
  toolCallCount: number;
  exportPath: string;
  reportPath: string;
  analysisJsonPath: string;
  analysis: SessionAnalysisResult;
  tracePassed: boolean;
  appliedHints: string[];
  skippedHints: string[];
};

function defaultOutDir(): string {
  return join(process.cwd(), "..", ".local", "agent-autopilot");
}

function buildThreadStub(
  scenario: AgentEvalScenario,
  chatId: string,
): ChatThread {
  return {
    id: chatId,
    title: `autopilot:${scenario.id}`,
    messages: [],
    updatedAt: Date.now(),
    workingDirectory: resolveScenarioWorkingDirectory(scenario),
    titleGenerated: true,
    titleManual: false,
    messageCount: 0,
  };
}

export async function runAgentAutopilotScenario(
  scenarioId: string,
  options: AgentAutopilotRunOptions = {},
): Promise<AgentAutopilotRunResult> {
  const scenario = loadEvalScenario(scenarioId);
  const baseUrl = options.baseUrl ?? defaultAgentGuiBaseUrl();
  const llmSelection =
    options.llmSelection
    ?? process.env.AGENT_EVAL_LLM_SELECTION?.trim()
    ?? (options.skipProbe ? "deepseek" : await resolveWorkingEvalLlmSelection());

  const chatId = `agent-autopilot-${scenario.id}-${Date.now()}`;
  const cwd = resolveScenarioWorkingDirectory(scenario);

  const chat = await postAgentGuiChat({
    baseUrl,
    userText: scenario.userPrompt,
    workingDirectory: cwd,
    llmSelection,
    chatMode: scenario.chatMode,
    chatId,
    benchMode: scenario.source === "quickerbench",
  });

  const messages: AgentUIMessage[] = chat.messages;
  const thread = buildThreadStub(scenario, chatId);
  const payload = buildChatThreadExportPayload(thread, messages, {
    liveMessages: messages,
  });

  const outDir = options.outDir ?? defaultOutDir();
  mkdirSync(outDir, { recursive: true });

  const exportFilename = buildChatThreadExportFilename(payload.thread);
  const exportPath = join(outDir, exportFilename);
  writeFileSync(exportPath, serializeChatThreadExport(payload), "utf8");

  const analysis = analyzeChatThreadExport(payload);
  const reportPath = join(outDir, `${scenario.id}-analysis.md`);
  const analysisJsonPath = join(outDir, `${scenario.id}-analysis.json`);
  writeFileSync(reportPath, formatSessionAnalysisReport(analysis), "utf8");
  writeFileSync(analysisJsonPath, formatSessionAnalysisJson(analysis), "utf8");

  const toolCalls = extractToolTrace(messages);
  const runtimeMetadata = payload.messages.length
    ? extractRuntimeMetadataFromExport(messages)
    : [];
  const rubric =
    scenario.source === "authoring" || scenario.source === "quickerbench"
      ? evaluateTraceRubric(toolCalls, {
          taskId: scenario.id,
          chatMode: scenario.chatMode,
          readOnly: scenario.readOnly,
          runtimeMetadata: runtimeMetadata.length > 0 ? runtimeMetadata : undefined,
          source: scenario.source === "quickerbench" ? "authoring" : scenario.source,
        })
      : evaluateTraceRubric(toolCalls, {
          chatMode: scenario.chatMode,
          readOnly: scenario.readOnly,
          runtimeMetadata: runtimeMetadata.length > 0 ? runtimeMetadata : undefined,
          source: scenario.source === "agent-gui" ? "agent-gui" : undefined,
        });
  const expect = evaluateTraceExpect(toolCalls, scenario.expect);
  const tracePassed =
    rubric.passed
    && expect.passed
    && analysis.trace.traceRubric.passed;

  let appliedHints: string[] = [];
  let skippedHints: string[] = [];
  if (options.applyHints !== false) {
    const applied = await applySessionOptimizationHints(analysis, {
      userPrompt: scenario.userPrompt,
    });
    appliedHints = applied.applied;
    skippedHints = applied.skipped;
  }

  return {
    scenarioId: scenario.id,
    llmSelection,
    chatOk: chat.ok,
    chatError: formatAgentEvalChatError(chat.error),
    toolCallCount: toolCalls.length,
    exportPath,
    reportPath,
    analysisJsonPath,
    analysis,
    tracePassed,
    appliedHints,
    skippedHints,
  };
}
