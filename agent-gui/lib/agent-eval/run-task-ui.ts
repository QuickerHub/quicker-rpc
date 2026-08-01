import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  defaultWorkspaceRoot,
  loadEvalScenario,
  resolveScenarioWorkingDirectory,
  type AgentEvalScenario,
} from "@/lib/agent-eval/eval-scenario";
import { defaultAgentGuiBaseUrl } from "@/lib/agent-eval/chat-client";
import { buildAgentEvalCapabilitySummary } from "@/lib/agent-eval/capability-summary";
import {
  extractAssistantText,
  extractToolTrace,
} from "@/lib/agent-eval/trace-extract";
import { evaluateTraceExpect, mergeTraceRubrics } from "@/lib/agent-eval/trace-expect";
import { evaluateTraceRubric } from "@/lib/agent-eval/trace-rubric";
import { runToolTestUiEval } from "@/lib/agent-eval/tool-test-ui-runner";
import type { AgentEvalJudgeResult, AgentEvalReport } from "@/lib/agent-eval/types";

function evalOutDir(): string {
  return join(defaultWorkspaceRoot(), ".local", "agent-eval");
}

export type RunAgentGuiUiEvalOptions = {
  baseUrl?: string;
  skipTraceRubric?: boolean;
  judge?: AgentEvalJudgeResult;
  timeoutMs?: number;
  headless?: boolean;
};

export async function runAgentGuiUiEvalScenario(
  scenario: AgentEvalScenario,
  options: RunAgentGuiUiEvalOptions = {},
): Promise<AgentEvalReport> {
  const startedAt = Date.now();
  const cwd = resolveScenarioWorkingDirectory(scenario);
  const baseUrl = options.baseUrl ?? defaultAgentGuiBaseUrl();

  const ui = await runToolTestUiEval({
    baseUrl,
    scenario,
    workingDirectory: cwd,
    timeoutMs: options.timeoutMs,
    headless: options.headless,
  });

  const assistantText = extractAssistantText(ui.messages);
  const toolCalls = extractToolTrace(ui.messages);
  const durationMs = Date.now() - startedAt;

  let status: AgentEvalReport["status"] = "finished";
  let error = ui.error;

  if (!ui.ok) {
    status =
      ui.httpStatus && ui.httpStatus >= 500 ? "startup_error" : "error";
  }

  const report: AgentEvalReport = {
    runner: "agent-gui-ui",
    taskId: scenario.id,
    tier: scenario.tier,
    status,
    durationMs,
    assistantText,
    toolCalls,
    runtimeMetadata: ui.runtimeMetadata,
    error,
  };

  if (!options.skipTraceRubric) {
    const rubric = evaluateTraceRubric(toolCalls, {
      chatMode: scenario.chatMode,
      readOnly: scenario.readOnly,
      runtimeMetadata: ui.runtimeMetadata,
      source: scenario.source === "quickerbench" ? "authoring" : scenario.source,
      taskId: scenario.id,
    });
    const expect = evaluateTraceExpect(toolCalls, scenario.expect);
    report.traceRubric = mergeTraceRubrics(rubric, expect);
  }

  report.capabilitySummary = buildAgentEvalCapabilitySummary({
    runtimeMetadata: ui.runtimeMetadata,
    toolCalls,
    traceRubric: report.traceRubric,
  });

  if (options.judge) {
    report.judge = options.judge;
  }

  const outDir = evalOutDir();
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `${scenario.id}-ui-${Date.now()}.json`);
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  report.outPath = outPath;

  return report;
}

export async function runAgentGuiUiEvalTaskById(
  taskId: string,
  options: RunAgentGuiUiEvalOptions = {},
): Promise<AgentEvalReport> {
  const scenario = loadEvalScenario(taskId);
  return runAgentGuiUiEvalScenario(scenario, options);
}
