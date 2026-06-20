import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  defaultWorkspaceRoot,
  loadEvalScenario,
  resolveScenarioWorkingDirectory,
  type AgentEvalScenario,
} from "@/lib/agent-eval/eval-scenario";
import {
  defaultAgentGuiBaseUrl,
  postAgentGuiChat,
} from "@/lib/agent-eval/chat-client";
import { buildAgentEvalCapabilitySummary } from "@/lib/agent-eval/capability-summary";
import { formatAgentEvalChatError } from "@/lib/agent-eval/eval-chat-error";
import { runMockVerify } from "@/lib/agent-eval/mock-verify";
import {
  extractAssistantText,
  extractLastActionId,
  extractToolTrace,
} from "@/lib/agent-eval/trace-extract";
import { extractBenchActionIdFromMessages } from "@/lib/bench-mode";
import { evaluateTraceExpect, mergeTraceRubrics } from "@/lib/agent-eval/trace-expect";
import { evaluateTraceRubric } from "@/lib/agent-eval/trace-rubric";
import type { AgentEvalJudgeResult, AgentEvalReport } from "@/lib/agent-eval/types";

function evalOutDir(): string {
  return join(defaultWorkspaceRoot(), ".local", "agent-eval");
}

function resolveMockProfile(scenario: AgentEvalScenario): string {
  return scenario.mockProfile?.trim() || scenario.id;
}

export type RunAgentGuiEvalOptions = {
  baseUrl?: string;
  llmSelection?: string;
  verifyMock?: boolean;
  skipTraceRubric?: boolean;
  judge?: AgentEvalJudgeResult;
};

export async function runAgentGuiEvalScenario(
  scenario: AgentEvalScenario,
  options: RunAgentGuiEvalOptions = {},
): Promise<AgentEvalReport> {
  const startedAt = Date.now();
  const cwd = resolveScenarioWorkingDirectory(scenario);
  const baseUrl = options.baseUrl ?? defaultAgentGuiBaseUrl();

  const chat = await postAgentGuiChat({
    baseUrl,
    userText: scenario.userPrompt,
    workingDirectory: cwd,
    llmSelection: options.llmSelection ?? process.env.AGENT_EVAL_LLM_SELECTION,
    chatMode: scenario.chatMode,
    chatId: `agent-eval-${scenario.id}`,
    benchMode: scenario.source === "quickerbench",
  });

  const assistantText = extractAssistantText(chat.messages);
  const toolCalls = extractToolTrace(chat.messages);
  const durationMs = Date.now() - startedAt;

  let status: AgentEvalReport["status"] = "finished";
  let error = formatAgentEvalChatError(chat.error);

  if (!chat.ok) {
    status = chat.httpStatus && chat.httpStatus >= 500 ? "startup_error" : "error";
  }

  const report: AgentEvalReport = {
    runner: "agent-gui",
    taskId: scenario.id,
    tier: scenario.tier,
    status,
    durationMs,
    assistantText,
    toolCalls,
    error,
  };

  if (!options.skipTraceRubric) {
    const rubric =
      scenario.source === "authoring" || scenario.source === "quickerbench"
        ? evaluateTraceRubric(toolCalls, { taskId: scenario.id })
        : { passed: true, violations: [] as string[] };
    const expect = evaluateTraceExpect(toolCalls, scenario.expect);
    report.traceRubric = mergeTraceRubrics(rubric, expect);
  }

  report.capabilitySummary = buildAgentEvalCapabilitySummary({
    toolCalls,
    traceRubric: report.traceRubric,
  });

  if (options.verifyMock && !scenario.readOnly && status === "finished") {
    const actionId =
      extractBenchActionIdFromMessages(chat.messages)
      ?? extractLastActionId(assistantText);
    const profileId = resolveMockProfile(scenario);
    if (actionId) {
      report.mockVerify = runMockVerify({
        actionId,
        mockProfile: profileId,
      });
    } else {
      report.mockVerify = {
        ok: false,
        profileId,
      };
      error = error ?? "mock verify skipped: no action id in assistant text";
      report.error = error;
    }
  }

  if (options.judge) {
    report.judge = options.judge;
  }

  const outDir = evalOutDir();
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `${scenario.id}-${Date.now()}.json`);
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  report.outPath = outPath;

  return report;
}

export async function runAgentGuiEvalTaskById(
  taskId: string,
  options: RunAgentGuiEvalOptions = {},
): Promise<AgentEvalReport> {
  const scenario = loadEvalScenario(taskId);
  return runAgentGuiEvalScenario(scenario, options);
}

export function isAgentEvalReportPassing(
  report: AgentEvalReport,
  options: { verifyMock?: boolean; requireJudge?: boolean } = {},
): boolean {
  if (report.status !== "finished") return false;
  if (report.traceRubric && !report.traceRubric.passed) return false;
  if (options.verifyMock && report.mockVerify && !report.mockVerify.ok) {
    return false;
  }
  if (options.requireJudge && report.judge && report.judge.passed === false) {
    return false;
  }
  return true;
}
